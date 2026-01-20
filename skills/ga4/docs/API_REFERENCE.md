# GA4 Analytics API Reference

Derived from: vibe-code/mcp-servers/ga4-analytics/index.js

## Overview

- **SDK:** `@google-analytics/data` (BetaAnalyticsDataClient)
- **Admin SDK:** `@google-analytics/admin` (AnalyticsAdminServiceClient)
- **Auth:** Service account via `GOOGLE_APPLICATION_CREDENTIALS`
- **Config:** `GA4_PROPERTY_ID`, `GA4_MEASUREMENT_ID`

## Speakmac Property

- **Measurement ID:** G-8HZZQQFYPS
- **Property ID:** 510572418

---

## Available Tools (from MCP Server)

### ga4_overview
High-level metrics for daily check-ins.

**Dimensions:** date
**Metrics:** activeUsers, newUsers, sessions, eventCount, engagementRate, averageSessionDuration

**Periods:** today, yesterday, 7days, 14days, 28days, 30days, 90days, 365days

---

### ga4_event_counts
Shows which features are being used and how often.

**Dimensions:** eventName
**Metrics:** eventCount, eventCountPerUser

---

### ga4_funnel_analysis
Analyze user funnels.

**Funnel Types:**

| Type | Events Tracked |
|------|----------------|
| onboarding | onboarding_started, onboarding_step_completed, permission_prompt_shown, permission_result, demo_transcription_started, demo_transcription_completed, onboarding_completed |
| transcription | transcription_started, transcription_completed, transcription_failed |
| permissions | permission_prompt_shown, permission_result |
| custom | User-defined event list |

---

### ga4_error_analysis
Analyze errors and failures.

**Error Types:**
- `transcription` - Filter: transcription_failed
- `license` - Filter: license_validation_error
- `all` - Both above

**Dimensions:** eventName, customEvent:error_domain, customEvent:error_code

---

### ga4_user_retention
Retention and engagement over time.

**Dimensions:** date or week (based on granularity)
**Metrics:** activeUsers, newUsers, dauPerWau, dauPerMau, wauPerMau

---

### ga4_transcription_metrics
Deep dive into transcription usage.

**Breakdowns:**
- `provider` - By transcription provider
- `day` - Daily breakdown
- `success_rate` - Success vs failure

**Dimensions:** eventName, customEvent:provider (or date)
**Metrics:** eventCount, totalUsers

---

### ga4_growth_metrics
Growth metrics: new installs, DAU/WAU/MAU trends.

**Dimensions:** date
**Metrics:** activeUsers, newUsers, totalUsers, sessions, engagedSessions

---

### ga4_custom_query
Power user tool for custom queries.

**Input:**
- `dimensions` - Array of GA4 dimensions
- `metrics` - Array of GA4 metrics
- `period` - Time period
- `event_name_filter` - Optional event filter
- `limit` - Max results (default 100)

---

### ga4_realtime
Real-time data: active users in last 30 minutes.

**Dimensions:** unifiedScreenName
**Metrics:** activeUsers, eventCount

---

### ga4_version_adoption
App version adoption tracking.

**Dimensions:** appVersion, date
**Metrics:** activeUsers, newUsers, sessions

---

### ga4_discover_property
Verify connection and property info.

**Returns:** measurementId, propertyId, status

---

## Date Range Options

| Period | Description |
|--------|-------------|
| today | Current day |
| yesterday | Previous day |
| 7days | Last 7 days |
| 14days | Last 14 days |
| 28days | Last 28 days |
| 30days | Last 30 days |
| 90days | Last 90 days |
| 365days | Last 365 days |

---

## Common GA4 Dimensions

| Dimension | Description |
|-----------|-------------|
| date | YYYYMMDD format |
| eventName | Event name |
| platform | Web, iOS, Android |
| appVersion | Application version |
| country | User country |
| city | User city |
| deviceCategory | Desktop, mobile, tablet |
| operatingSystem | OS name |
| browser | Browser name |

---

## Common GA4 Metrics

| Metric | Description |
|--------|-------------|
| activeUsers | Users with engaged sessions |
| newUsers | First-time users |
| totalUsers | Total unique users |
| sessions | Total sessions |
| eventCount | Total events |
| engagementRate | Engaged sessions / sessions |
| averageSessionDuration | Mean session length |
| screenPageViews | Page/screen views |
| conversions | Conversion events |

---

## Custom Event Parameters (Speakmac-specific)

| Parameter | Events | Description |
|-----------|--------|-------------|
| customEvent:provider | transcription_* | Transcription provider used |
| customEvent:error_domain | *_failed | Error category |
| customEvent:error_code | *_failed | Specific error code |

---

## Example Queries

### Get daily active users for last 7 days
```javascript
runReport(
  ["date"],
  ["activeUsers", "newUsers"],
  { startDate: "7daysAgo", endDate: "today" }
)
```

### Get transcription events by provider
```javascript
runReport(
  ["eventName", "customEvent:provider"],
  ["eventCount", "totalUsers"],
  { startDate: "7daysAgo", endDate: "today" },
  {
    orGroup: {
      expressions: [
        { filter: { fieldName: "eventName", stringFilter: { value: "transcription_started", matchType: "EXACT" } } },
        { filter: { fieldName: "eventName", stringFilter: { value: "transcription_completed", matchType: "EXACT" } } },
        { filter: { fieldName: "eventName", stringFilter: { value: "transcription_failed", matchType: "EXACT" } } }
      ]
    }
  }
)
```

### Get real-time active users
```javascript
client.runRealtimeReport({
  property: `properties/${propertyId}`,
  dimensions: [{ name: "unifiedScreenName" }],
  metrics: [{ name: "activeUsers" }, { name: "eventCount" }]
})
```
