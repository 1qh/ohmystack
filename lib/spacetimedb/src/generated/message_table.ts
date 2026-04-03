/* eslint-disable */
import {
  TypeBuilder as __TypeBuilder,
  t as __t,
  type AlgebraicTypeType as __AlgebraicTypeType,
  type Infer as __Infer,
} from "spacetimedb";
import {
  ChildPartsItem,
} from "./types";
export default __t.row({
  get parts() {
    return __t.array(ChildPartsItem);
  },
  role: __t.string(),
  createdAt: __t.timestamp().name("created_at"),
  chatId: __t.u32().name("chat_id"),
  id: __t.u32().primaryKey(),
  updatedAt: __t.timestamp().name("updated_at"),
  userId: __t.identity().name("user_id"),
});
