/* eslint-disable */
import {
  TypeBuilder as __TypeBuilder,
  t as __t,
  type AlgebraicTypeType as __AlgebraicTypeType,
  type Infer as __Infer,
} from "spacetimedb";
export default __t.row({
  option: __t.string(),
  createdAt: __t.timestamp().name("created_at"),
  deletedAt: __t.option(__t.timestamp()).name("deleted_at"),
  id: __t.u32().primaryKey(),
  idempotencyKey: __t.option(__t.string()).name("idempotency_key"),
  parent: __t.string(),
  seq: __t.u32(),
  userId: __t.identity().name("user_id"),
});
