/* eslint-disable */
import {
  TypeBuilder as __TypeBuilder,
  t as __t,
  type AlgebraicTypeType as __AlgebraicTypeType,
  type Infer as __Infer,
} from "spacetimedb";
export default {
  id: __t.u32(),
  options: __t.option(__t.array(__t.string())),
  question: __t.option(__t.string()),
  expectedUpdatedAt: __t.option(__t.timestamp()),
};
