/* eslint-disable */
import {
  TypeBuilder as __TypeBuilder,
  t as __t,
  type AlgebraicTypeType as __AlgebraicTypeType,
  type Infer as __Infer,
} from "spacetimedb";
export default __t.row({
  description: __t.option(__t.string()),
  name: __t.string(),
  status: __t.option(__t.string()),
  editors: __t.option(__t.array(__t.identity())),
  createdAt: __t.timestamp().name("created_at"),
  id: __t.u32().primaryKey(),
  orgId: __t.u32().name("org_id"),
  updatedAt: __t.timestamp().name("updated_at"),
  userId: __t.identity().name("user_id"),
});
