/* eslint-disable */
import {
  TypeBuilder as __TypeBuilder,
  t as __t,
  type AlgebraicTypeType as __AlgebraicTypeType,
  type Infer as __Infer,
} from "spacetimedb";
export default __t.row({
  createdAt: __t.timestamp().name("created_at"),
  id: __t.u32().primaryKey(),
  isAdmin: __t.bool().name("is_admin"),
  orgId: __t.u32().name("org_id"),
  updatedAt: __t.timestamp().name("updated_at"),
  userId: __t.identity().name("user_id"),
});
