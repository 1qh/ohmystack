/* eslint-disable */
import {
  TypeBuilder as __TypeBuilder,
  t as __t,
  type AlgebraicTypeType as __AlgebraicTypeType,
  type Infer as __Infer,
} from "spacetimedb";
export default __t.row({
  active: __t.bool(),
  message: __t.string(),
  createdAt: __t.timestamp().name("created_at"),
  id: __t.u32().primaryKey(),
  key: __t.string(),
  updatedAt: __t.timestamp().name("updated_at"),
});
