/* eslint-disable */
import {
  TypeBuilder as __TypeBuilder,
  t as __t,
  type AlgebraicTypeType as __AlgebraicTypeType,
  type Infer as __Infer,
} from "spacetimedb";
export default __t.row({
  isPublic: __t.bool().name("is_public"),
  title: __t.string(),
  createdAt: __t.timestamp().name("created_at"),
  id: __t.u32().primaryKey(),
  updatedAt: __t.timestamp().name("updated_at"),
  userId: __t.identity().name("user_id"),
});
