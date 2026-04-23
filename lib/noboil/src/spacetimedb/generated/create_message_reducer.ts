/* eslint-disable */
import {
  TypeBuilder as __TypeBuilder,
  t as __t,
  type AlgebraicTypeType as __AlgebraicTypeType,
  type Infer as __Infer,
} from "spacetimedb";
import {
  MessagePartsItem,
} from "./types";
export default {
  chatId: __t.u32(),
  get parts() {
    return __t.array(MessagePartsItem);
  },
  role: __t.string(),
};
