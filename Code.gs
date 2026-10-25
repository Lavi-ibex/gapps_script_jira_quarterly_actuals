/**
 * Google Apps Script Backend for Ibex Quarterly Planning Actual Effort Dashboard.
 * Fetches completed sprint child issues and parent epics from Jira Cloud REST API,
 * attributes effort (Story Points) to canonical teams and buckets, caches results,
 * and serves an interactive dashboard.
 */

// Configuration constants
var CACHE_EXPIRATION_SECONDS = 3600; // 1 hour
var CACHE_PREFIX = 'IBEX_ACTUALS_';
var AUTHORIZED_EMAIL_DOMAIN = 'ibex-ai.com';

var SUPPORTED_QUARTERS = ['2026_Q3', '2026_Q4'];

// Custom field IDs
var QUARTER_FIELD_ID = 'customfield_10217';       // Quarter (e.g. 2026_Q3)
var EPIC_BUCKET_FIELD_ID = 'customfield_12204';   // Epic Bucket
var STORY_POINTS_FIELD_ID = 'customfield_10037';  // Story Points
var SPRINT_FIELD_ID = 'customfield_10020';        // Sprints list
var TEAM_FIELD_ID = 'customfield_10001';          // Team object
var ITEAM_FIELD_ID = 'customfield_10128';         // iTeam

/**
 * HTTP GET entry point for Google Apps Script Web App.
 * Serves Index.html with permissions for standalone and iframe embedding.
 */
function doGet(e) {
  return HtmlService.createHtmlOutputFromFile('Index')
    .setTitle('Ibex Quarterly Actual Effort Dashboard')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/**
 * Public client-callable API to fetch quarterly actuals data.
 * @param {string} quarterKey - '2026_Q3', '2026_Q4', etc.
 * @param {boolean} forceRefresh - If true, bypasses cache and queries Jira directly.
 * @returns {Object} Quarterly actuals payload.
 */
function apiGetQuarterlyActuals(quarterKey, forceRefresh) {
  var target = (quarterKey || '2026_Q3').trim().toUpperCase();
  // Normalize format e.g. 26Q3 -> 2026_Q3
  if (/^26Q[1-4]$/.test(target)) {
    target = '20' + target.substring(0, 2) + '_' + target.substring(2);
  }

  return getActualsForQuarter(target, !!forceRefresh);
}

/**
 * Public client-callable API to get list of supported quarters.
 */
function apiGetSupportedQuarters() {
  return SUPPORTED_QUARTERS;
}

/**
 * Retrieves actuals from CacheService or live Jira API.
 */
function getActualsForQuarter(quarterKey, forceRefresh) {
  var cacheKey = CACHE_PREFIX + quarterKey;

  if (!forceRefresh) {
    var cached = getCachedJson(cacheKey);
    if (cached) {
      cached.fromCache = true;
      return cached;
    }
  }

  var freshData = fetchQuarterlyDataFromJira(quarterKey);
  freshData.fromCache = false;
  freshData.availableQuarters = SUPPORTED_QUARTERS;

  try {
    putCachedJson(cacheKey, freshData, CACHE_EXPIRATION_SECONDS);
  } catch (err) {
    Logger.log('Cache put error: ' + err.toString());
  }

  return freshData;
}

/**
 * Saves JSON object across multiple 90KB cache keys to bypass CacheService 100KB limit.
 */
function putCachedJson(baseKey, data, ttl) {
  var cache = CacheService.getScriptCache();
  var jsonStr = JSON.stringify(data);
  var chunkSize = 90000;
  var count = Math.ceil(jsonStr.length / chunkSize);

  var payload = {};
  payload[baseKey + '_count'] = String(count);
  for (var i = 0; i < count; i++) {
    payload[baseKey + '_' + i] = jsonStr.substring(i * chunkSize, (i + 1) * chunkSize);
  }
  cache.putAll(payload, ttl);
}

/**
 * Retrieves and reassembles chunked JSON from CacheService.
 */
function getCachedJson(baseKey) {
  var cache = CacheService.getScriptCache();
  var countStr = cache.get(baseKey + '_count');
  if (!countStr) return null;

  var count = parseInt(countStr, 10);
  if (isNaN(count) || count <= 0) return null;

  var keys = [];
  for (var i = 0; i < count; i++) {
    keys.push(baseKey + '_' + i);
  }

  var chunkMap = cache.getAll(keys);
  var fullStr = '';
  for (var j = 0; j < count; j++) {
    var piece = chunkMap[baseKey + '_' + j];
    if (piece === undefined || piece === null) {
      return null; // incomplete cache miss
    }
    fullStr += piece;
  }

  try {
    return JSON.parse(fullStr);
  } catch (e) {
    return null;
  }
}

/**
 * Jira API helper using UrlFetchApp.
 */
function jiraFetch(endpoint, method, payload) {
  var scriptProps = PropertiesService.getScriptProperties();
  var baseUrl = (scriptProps.getProperty('JIRA_BASE_URL') || 'https://ibex-ai.atlassian.net').trim().replace(/\/+$/, '');
  var userEmail = (scriptProps.getProperty('JIRA_USER_EMAIL') || scriptProps.getProperty('JIRA_EMAIL') || '').trim();
  var apiToken = (scriptProps.getProperty('JIRA_API_TOKEN') || scriptProps.getProperty('JIRA_TOKEN') || '').trim();

  if (!userEmail || !apiToken) {
    throw new Error('Jira credentials (JIRA_USER_EMAIL and JIRA_API_TOKEN) are not configured in Script Properties.');
  }

  var authHeader = 'Basic ' + Utilities.base64Encode(userEmail + ':' + apiToken);
  var options = {
    method: method || 'get',
    headers: {
      'Authorization': authHeader,
      'Accept': 'application/json'
    },
    muteHttpExceptions: true
  };

  if (payload) {
    options.contentType = 'application/json';
    options.payload = JSON.stringify(payload);
  }

  var response = UrlFetchApp.fetch(baseUrl + endpoint, options);
  var responseCode = response.getResponseCode();

  if (responseCode < 200 || responseCode >= 300) {
    var errText = response.getContentText();
    throw new Error('Jira API error (' + responseCode + '): ' + errText.substring(0, 300));
  }

  return JSON.parse(response.getContentText());
}

/**
 * Extracts regex pattern to match sprint names for a quarter.
 * Matches: '26Q3', '2026 Q3', '2026_Q3', '26-Q3'
 */
function getQuarterRegex(quarterStr) {
  var cleaned = quarterStr.trim().toUpperCase();
  var m = cleaned.match(/(?:20)?(\d{2})[_\s-]?Q([1-4])/i);
  if (m) {
    var yy = m[1];
    var q = m[2];
    return new RegExp('(?:20)?' + yy + '[\\s_-]?Q' + q, 'i');
  }
  return new RegExp(cleaned, 'i');
}

/**
 * Discovers all sprints across all boards that belong to the target quarter.
 */
function getQuarterSprints(quarterRegex) {
  var boardsResp = jiraFetch('/rest/agile/1.0/board?maxResults=50', 'get');
  var boards = (boardsResp && boardsResp.values) ? boardsResp.values : [];
  var matchingSprints = {};

  for (var b = 0; b < boards.length; b++) {
    var boardId = boards[b].id;
    try {
      var sprintResp = jiraFetch('/rest/agile/1.0/board/' + boardId + '/sprint?maxResults=100', 'get');
      var sprints = (sprintResp && sprintResp.values) ? sprintResp.values : [];
      for (var s = 0; s < sprints.length; s++) {
        var sp = sprints[s];
        var sName = sp.name || '';
        if (quarterRegex.test(sName)) {
          matchingSprints[sp.id] = {
            id: sp.id,
            name: sName,
            state: sp.state,
            boardName: boards[b].name
          };
        }
      }
    } catch (err) {
      // Ignore boards that don't support sprints
    }
  }

  return matchingSprints;
}

/**
 * Normalizes team names into the 10 canonical Ibex teams.
 */
function normalizeTeam(fields) {
  var teamName = 'Unassigned';

  var teamObj = fields[TEAM_FIELD_ID];
  if (teamObj) {
    if (typeof teamObj === 'object') {
      teamName = teamObj.name || teamObj.title || teamObj.value || 'Unassigned';
    } else if (typeof teamObj === 'string' && teamObj.trim()) {
      teamName = teamObj.trim();
    }
  }

  if (teamName === 'Unassigned') {
    var iteamObj = fields[ITEAM_FIELD_ID];
    if (iteamObj) {
      if (typeof iteamObj === 'object') {
        teamName = iteamObj.value || iteamObj.name || 'Unassigned';
      } else if (typeof iteamObj === 'string' && iteamObj.trim()) {
        teamName = iteamObj.trim();
      }
    }
  }

  var lower = teamName.toLowerCase();
  if (lower.indexOf('algo') !== -1) return 'Algo';
  if (lower.indexOf('backend') !== -1 || lower === 'be') return 'Backend';
  if (lower.indexOf('clinical') !== -1 || lower === 'clin') return 'Clinical';
  if (lower.indexOf('cloud') !== -1) return 'Cloud';
  if (lower.indexOf('data') !== -1) return 'Data';
  if (lower.indexOf('ppm') !== -1 || lower.indexOf('program') !== -1 || lower.indexOf('product') !== -1 || lower === 'pgm' || lower === 'pdm') return 'PPM';
  if (lower.indexOf('qara') !== -1 || lower.indexOf('qa/ra') !== -1 || lower.indexOf('qa ra') !== -1) return 'QARA';
  if (lower.indexOf('quant') !== -1) return 'Quantification';
  if (lower.indexOf('sqa') !== -1) return 'SQA';
  if (lower.indexOf('web') !== -1) return 'Web Applications';

  return teamName;
}

/**
 * Main Jira orchestrator: fetches sprints, completed child issues, and parent epic metadata.
 */
function fetchQuarterlyDataFromJira(quarterKey) {
  var quarterRegex = getQuarterRegex(quarterKey);
  var matchingSprints = getQuarterSprints(quarterRegex);
  var sprintIds = Object.keys(matchingSprints);

  if (sprintIds.length === 0) {
    return {
      quarter: quarterKey,
      lastUpdated: new Date().toISOString(),
      sprintCount: 0,
      totalIssues: 0,
      rows: []
    };
  }

  // 1. Fetch completed child issues belonging to these sprints
  var fieldsToFetch = [
    'key', 'summary', 'issuetype', 'status', 'parent', 'assignee',
    STORY_POINTS_FIELD_ID, SPRINT_FIELD_ID, TEAM_FIELD_ID, ITEAM_FIELD_ID,
    'fixVersions', 'labels'
  ];

  var allChildren = [];
  var seenKeys = {};
  var chunkSize = 50;

  for (var i = 0; i < sprintIds.length; i += chunkSize) {
    var chunk = sprintIds.slice(i, i + chunkSize);
    var sprintClause = 'sprint in (' + chunk.join(',') + ')';
    var jql = 'project = IBX AND parent is not EMPTY AND statusCategory = Done AND ' + sprintClause;

    var nextPageToken = null;
    var maxPages = 15;
    var pageCount = 0;

    do {
      var body = {
        jql: jql,
        fields: fieldsToFetch,
        maxResults: 100
      };
      if (nextPageToken) {
        body.nextPageToken = nextPageToken;
      }

      var searchResp = jiraFetch('/rest/api/3/search/jql', 'post', body);
      var issues = searchResp.issues || [];

      for (var k = 0; k < issues.length; k++) {
        var issue = issues[k];
        if (!seenKeys[issue.key]) {
          seenKeys[issue.key] = true;
          allChildren.push(issue);
        }
      }

      nextPageToken = searchResp.nextPageToken || null;
      pageCount++;
    } while (nextPageToken && pageCount < maxPages);
  }

  // 2. Collect unique parent epic keys
  var epicKeysMap = {};
  for (var c = 0; c < allChildren.length; c++) {
    var parent = allChildren[c].fields && allChildren[c].fields.parent;
    if (parent && parent.key) {
      epicKeysMap[parent.key] = true;
    }
  }
  var epicKeys = Object.keys(epicKeysMap);

  // 3. Fetch parent epics metadata in chunks
  var epicsData = {};
  var epicFields = ['key', 'summary', 'status', QUARTER_FIELD_ID, EPIC_BUCKET_FIELD_ID, 'fixVersions', 'labels'];

  for (var eIdx = 0; eIdx < epicKeys.length; eIdx += chunkSize) {
    var epicChunk = epicKeys.slice(eIdx, eIdx + chunkSize);
    var epicJql = 'key in (' + epicChunk.join(',') + ')';

    var epicResp = jiraFetch('/rest/api/3/search/jql', 'post', {
      jql: epicJql,
      fields: epicFields,
      maxResults: 100
    });

    var fetchedEpics = epicResp.issues || [];
    for (var f = 0; f < fetchedEpics.length; f++) {
      var ep = fetchedEpics[f];
      var epFields = ep.fields || {};

      var qVal = epFields[QUARTER_FIELD_ID];
      var quarterStr = '';
      if (qVal) {
        quarterStr = (typeof qVal === 'object') ? (qVal.value || '') : String(qVal);
      }

      var bVal = epFields[EPIC_BUCKET_FIELD_ID];
      var bucketStr = 'Other';
      if (bVal) {
        bucketStr = (typeof bVal === 'object') ? (bVal.value || '') : String(bVal);
      }
      if (!bucketStr) bucketStr = 'Other';

      var fixVers = (epFields.fixVersions || []).map(function(v) { return v.name; }).join(', ');
      var labels = (epFields.labels || []).join(', ');

      epicsData[ep.key] = {
        key: ep.key,
        summary: epFields.summary || '',
        status: (epFields.status && epFields.status.name) || '',
        quarter: quarterStr,
        bucket: bucketStr,
        fixVersion: fixVers,
        labels: labels
      };
    }
  }

  // 4. Assemble flat rows for client-side processing
  var rows = [];
  for (var r = 0; r < allChildren.length; r++) {
    var child = allChildren[r];
    var chFields = child.fields || {};
    var parentKey = (chFields.parent && chFields.parent.key) || '';
    var epic = epicsData[parentKey] || {
      key: parentKey,
      summary: (chFields.parent && chFields.parent.fields && chFields.parent.fields.summary) || '',
      quarter: '',
      bucket: 'Other',
      fixVersion: '',
      labels: ''
    };

    var sp = 0.0;
    var spVal = chFields[STORY_POINTS_FIELD_ID];
    if (spVal !== null && spVal !== undefined) {
      var parsedSp = parseFloat(spVal);
      if (!isNaN(parsedSp)) sp = parsedSp;
    }

    var assigneeName = 'Unassigned';
    if (chFields.assignee) {
      assigneeName = chFields.assignee.displayName || chFields.assignee.name || 'Unassigned';
    }

    // Extract sprint name
    var sprintName = '';
    var sprintArr = chFields[SPRINT_FIELD_ID] || [];
    if (Array.isArray(sprintArr) && sprintArr.length > 0) {
      var latestSprint = sprintArr[sprintArr.length - 1];
      if (typeof latestSprint === 'object') {
        sprintName = latestSprint.name || '';
      } else if (typeof latestSprint === 'string') {
        var sm = latestSprint.match(/name=([^,\]]+)/);
        sprintName = sm ? sm[1].trim() : latestSprint;
      }
    }

    var team = normalizeTeam(chFields);

    rows.push({
      epicKey: epic.key,
      epicSummary: epic.summary,
      epicQuarter: epic.quarter,
      epicFixVersion: epic.fixVersion,
      epicLabels: epic.labels,
      epicBucket: epic.bucket,
      childKey: child.key,
      childType: (chFields.issuetype && chFields.issuetype.name) || 'Task',
      childStatus: (chFields.status && chFields.status.name) || 'Done',
      childSummary: chFields.summary || '',
      childAssignee: assigneeName,
      childTeam: team,
      childSprint: sprintName,
      childStoryPoints: sp
    });
  }

  return {
    quarter: quarterKey,
    lastUpdated: new Date().toISOString(),
    sprintCount: sprintIds.length,
    totalIssues: rows.length,
    rows: rows
  };
}

/**
 * Diagnostic helper to test Jira Cloud credentials.
 */
function apiTestJiraConnection() {
  try {
    var user = jiraFetch('/rest/api/3/myself', 'get');
    return { success: true, user: user.displayName || user.emailAddress };
  } catch (err) {
    return { success: false, error: err.toString() };
  }
}
