/* eslint-disable */
import {
  TypeBuilder as __TypeBuilder,
  t as __t,
  type AlgebraicTypeType as __AlgebraicTypeType,
  type Infer as __Infer,
} from "spacetimedb";
export default {
  orgId: __t.u32(),
  content: __t.option(__t.string()),
  slug: __t.string(),
  status: __t.string(),
  title: __t.string(),
};
