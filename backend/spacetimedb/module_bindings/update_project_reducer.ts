/* eslint-disable */
import {
  TypeBuilder as __TypeBuilder,
  t as __t,
  type AlgebraicTypeType as __AlgebraicTypeType,
  type Infer as __Infer,
} from "spacetimedb";
export default {
  id: __t.u32(),
  description: __t.option(__t.option(__t.string())),
  name: __t.option(__t.string()),
  status: __t.option(__t.option(__t.string())),
  editors: __t.option(__t.option(__t.array(__t.identity()))),
  expectedUpdatedAt: __t.option(__t.timestamp()),
};
