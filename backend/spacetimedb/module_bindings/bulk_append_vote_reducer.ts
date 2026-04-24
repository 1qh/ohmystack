/* eslint-disable */
import {
  TypeBuilder as __TypeBuilder,
  t as __t,
  type AlgebraicTypeType as __AlgebraicTypeType,
  type Infer as __Infer,
} from "spacetimedb";
import {
  VoteBulkItem,
} from "./types";
export default {
  get items() {
    return __t.array(VoteBulkItem);
  },
  parent: __t.string(),
};
