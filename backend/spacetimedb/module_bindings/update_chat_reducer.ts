/* eslint-disable */
import {
  TypeBuilder as __TypeBuilder,
  t as __t,
  type AlgebraicTypeType as __AlgebraicTypeType,
  type Infer as __Infer,
} from "spacetimedb";
export default {
  id: __t.u32(),
  isPublic: __t.option(__t.bool()),
  title: __t.option(__t.string()),
  expectedUpdatedAt: __t.option(__t.timestamp()),
};
