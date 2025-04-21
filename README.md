to reproduce:

```
pnpm i
pnpm db:setup
pnpm db:perms
pnpm test
```

when a 500 error gets hit, output looks something like this (it may be thrown on a different test):

```diff
 FAIL  test/db-access.test.ts > InstantDB basic access, relationship and permission Checks > cost must have internalCost, startOfMonth and be associated with a project
Error: Expected to be a permission denied error but got:
{
  "name": "InstantAPIError",
  "status": 500,
  "body": {
    "type": "sql-exception",
    "message": "SQL Exception: deadlock-detected",
    "hint": {
      "table": null,
      "condition": "deadlock-detected",
      "constraint": null,
      "debug-uri": "https://www.instantdb.com/debug-uri/450973bb7bafaccbbac72e34bf40e372/cd84327165438453"
    },
    "trace-id": "450973bb7bafaccbbac72e34bf40e372"
  }
}

- Expected
+ Received

- {
+ InstantAPIError {
+   "message": "SQL Exception: deadlock-detected",
+   "name": "InstantAPIError",
+   "status": 500,
    "body": {
      "hint": {
-       "expected": "perms-pass?",
+       "condition": "deadlock-detected",
+       "constraint": null,
+       "debug-uri": "https://www.instantdb.com/debug-uri/450973bb7bafaccbbac72e34bf40e372/cd84327165438453",
+       "table": null,
      },
-     "message": "Permission denied: not perms-pass?",
-     "type": "permission-denied",
+     "message": "SQL Exception: deadlock-detected",
+     "trace-id": "450973bb7bafaccbbac72e34bf40e372",
+     "type": "sql-exception",
    },
-   "status": 400,
  }

 ❯ test/db-access.test.ts:915:5
```
