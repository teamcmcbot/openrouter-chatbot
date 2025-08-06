# Active Seconds Migration Testing Checklist

## Pre-Migration Testing

### Data Validation

- [ ] **Verify current data values**
  ```sql
  SELECT user_id, usage_date, active_minutes,
         active_minutes / 60.0 as estimated_minutes
  FROM public.user_usage_daily
  WHERE active_minutes > 0
  ORDER BY active_minutes DESC
  LIMIT 10;
  ```
- [ ] **Confirm values are in seconds** (not minutes)

  - Values should be reasonable for seconds (e.g., 30-3600 for typical sessions)
  - Values divided by 60 should give reasonable minute estimates

- [ ] **Backup current database**
  ```bash
  pg_dump -h localhost -U postgres -d your_db > backup_before_migration.sql
  ```

### Function Testing

- [ ] **Test track_user_usage function**

  ```sql
  SELECT public.track_user_usage(
    '00000000-0000-0000-0000-000000000001'::uuid,
    1, 0, 100, 0, 'test-model', false, 30
  );
  ```

- [ ] **Test get_user_complete_profile function**

  ```sql
  SELECT public.get_user_complete_profile(
    (SELECT id FROM public.profiles LIMIT 1)
  );
  ```

- [ ] **Verify API responses contain active_minutes field**

## Migration Execution

### Step 1: Run Forward Migration

- [ ] **Execute migration script**

  ```bash
  psql -h localhost -U postgres -d your_db -f database/patches/active-seconds/01-forward-migration.sql
  ```

- [ ] **Check for errors in output**
- [ ] **Verify success messages appear**

### Step 2: Run Verification Script

- [ ] **Execute verification script**

  ```bash
  psql -h localhost -U postgres -d your_db -f database/patches/active-seconds/03-verification.sql
  ```

- [ ] **Confirm all verification checks pass**
- [ ] **Review any warnings or notes**

## Post-Migration Testing

### Schema Validation

- [ ] **Verify column renamed successfully**

  ```sql
  SELECT column_name, data_type, column_default
  FROM information_schema.columns
  WHERE table_name = 'user_usage_daily'
  AND column_name IN ('active_minutes', 'active_seconds');
  ```

  - Should show only `active_seconds`, not `active_minutes`

- [ ] **Check function signatures updated**
  ```sql
  SELECT routine_name, parameter_name, data_type
  FROM information_schema.parameters
  WHERE specific_name IN (
    SELECT specific_name
    FROM information_schema.routines
    WHERE routine_name = 'track_user_usage'
  );
  ```

### Data Integrity Testing

- [ ] **Verify data preserved**

  ```sql
  SELECT COUNT(*) as total_records,
         SUM(active_seconds) as total_seconds,
         AVG(active_seconds) as avg_seconds,
         MAX(active_seconds) as max_seconds
  FROM public.user_usage_daily;
  ```

  - Compare with pre-migration values

- [ ] **Test data insertion**
  ```sql
  INSERT INTO public.user_usage_daily
  (user_id, usage_date, active_seconds)
  VALUES
  ('00000000-0000-0000-0000-000000000002', CURRENT_DATE, 120);
  ```

### Function Testing

- [ ] **Test track_user_usage with new parameter**

  ```sql
  SELECT public.track_user_usage(
    '00000000-0000-0000-0000-000000000003'::uuid,
    1, 1, 50, 75, 'gpt-4', false, 45  -- last param is active_seconds
  );
  ```

- [ ] **Verify usage data inserted correctly**

  ```sql
  SELECT * FROM public.user_usage_daily
  WHERE user_id = '00000000-0000-0000-0000-000000000003'
  AND usage_date = CURRENT_DATE;
  ```

- [ ] **Test get_user_complete_profile API response**
  ```sql
  SELECT public.get_user_complete_profile(
    '00000000-0000-0000-0000-000000000003'::uuid
  );
  ```
  - Verify response contains `active_seconds` field
  - Verify no `active_minutes` field present

### Application Integration Testing

- [ ] **Test API endpoints that use user profiles**
- [ ] **Verify frontend can handle field name change**
- [ ] **Check any dashboards or reporting tools**
- [ ] **Validate third-party integrations**

## Rollback Testing (Optional)

### Test Rollback Capability

- [ ] **Execute reverse migration on test database**

  ```bash
  psql -h localhost -U postgres -d test_db -f database/patches/active-seconds/02-reverse-migration.sql
  ```

- [ ] **Verify rollback restores original state**
- [ ] **Test original functions work after rollback**

## Documentation Updates

### Update Sample Files

- [ ] **Update database/samples/get_user_complete_profile.json**

  - Change `"active_minutes"` to `"active_seconds"` on lines 44, 54, 64

- [ ] **Update docs/database/DB_StepThrough.md**
  - Change reference on line 133 from `active_minutes` to `active_seconds`

### Update Schema Files (After Testing)

- [ ] **Apply changes to database/schema/01-users.sql**
- [ ] **Apply changes to database/schema/02-chat.sql**
- [ ] **Run validation on updated schema files**

## Cleanup

### Remove Test Data

- [ ] **Clean up test records**
  ```sql
  DELETE FROM public.user_usage_daily
  WHERE user_id IN (
    '00000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000002',
    '00000000-0000-0000-0000-000000000003'
  );
  ```

### Final Validation

- [ ] **Run final verification script**
- [ ] **Monitor application logs for errors**
- [ ] **Confirm all systems operational**

## Communication

### Stakeholder Notification

- [ ] **Notify API consumers of field name change**
- [ ] **Update API documentation**
- [ ] **Announce maintenance window if required**
- [ ] **Document change in release notes**

## Success Criteria

✅ **Migration Successful When:**

- All verification checks pass
- No data loss occurs
- All functions work with new parameter names
- API responses use new field names
- Application continues to function normally
- Rollback capability confirmed (if tested)

## Troubleshooting

### Common Issues

1. **Function not found errors**

   - Re-run migration script
   - Check function signatures

2. **Data type mismatches**

   - Verify column definitions
   - Check parameter types

3. **Missing field in API responses**
   - Verify function returns correct JSON
   - Check application integration

### Emergency Rollback

If critical issues occur:

```bash
psql -h localhost -U postgres -d your_db -f database/patches/active-seconds/02-reverse-migration.sql
```
