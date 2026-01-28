# Question Templates for Uncertainty Detection

## 1. UI/Screen Definition
**Trigger**: Keywords like "UI", "screen", "layout" without version info.
**Template**:
```
? Please confirm the UI spec version.
- Latest version: v3 (2025-12-18)
- Previous version: v2 (2025-12-10)
- Key changes: [date input format, column structure, etc.]
Which version should we use?
```

## 2. API Specifications
**Trigger**: Keywords like "API", "backend", "integration" without endpoints.
**Template**:
```
? Please share the API spec draft.
Required info:
- Endpoint: POST /api/admin/...
- Request params: { "date": "yyyyMMdd" }
- Response fields: { "success": true, "job_execution_id": 12345, ... }
- Error response schema
Swagger link or JSON schema is helpful.
```

## 3. Date/Period Logic
**Trigger**: "date" or "period" keywords without single/range clarity.
**Template**:
```
? Please clarify the date input mode.
- Option A: single date (yyyy-mm-dd)
- Option B: date range (start ~ end)
Which do you prefer?
```

## 4. Pagination Strategy
**Trigger**: "list" or "table" keywords without paging details.
**Template**:
```
? Please confirm the pagination strategy.
- Option A: server-side (page, size params)
- Option B: client-side (load all, then filter in UI)
Which do you prefer?
```

## 5. Error Handling Policy
**Trigger**: new feature request without error policy.
**Template**:
```
? Please confirm the error handling policy.
- Option A: Alert (window.alert)
- Option B: Toast (react-hot-toast)
- Option C: Inline message
Do we have a project standard?
```
