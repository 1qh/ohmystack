import { mock } from 'bun:test'
const noop = () => undefined
const zero = () => 0
const zeroBig = () => 0n
mock.module('sonner', () => ({
  toast: Object.assign(noop, {
    dismiss: noop,
    error: noop,
    loading: noop,
    success: noop
  })
}))
mock.module('spacetime:sys@2.0', () => ({
  console_log: noop,
  console_timer_end: noop,
  console_timer_start: zero,
  datastore_delete_all_by_eq_bsatn: zero,
  datastore_delete_by_index_scan_point_bsatn: zero,
  datastore_delete_by_index_scan_range_bsatn: zero,
  datastore_index_scan_point_bsatn: zero,
  datastore_index_scan_range_bsatn: zero,
  datastore_insert_bsatn: zero,
  datastore_table_row_count: zeroBig,
  datastore_table_scan_bsatn: zero,
  datastore_update_bsatn: zero,
  get_jwt_payload: () => new Uint8Array(),
  identity: zeroBig,
  index_id_from_name: zero,
  moduleHooks: Symbol('moduleHooks'),
  procedure_abort_mut_tx: noop,
  procedure_commit_mut_tx: noop,
  procedure_http_request: () => [new Uint8Array(), new Uint8Array()],
  procedure_start_mut_tx: zeroBig,
  register_hooks: noop,
  row_iter_bsatn_advance: zero,
  row_iter_bsatn_close: noop,
  table_id_from_name: zero,
  volatile_nonatomic_schedule_immediate: noop
}))
