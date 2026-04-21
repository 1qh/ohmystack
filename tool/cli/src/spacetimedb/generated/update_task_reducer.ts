/* eslint-disable */
import {
  TypeBuilder as __TypeBuilder,
  t as __t,
  type AlgebraicTypeType as __AlgebraicTypeType,
  type Infer as __Infer,
} from "spacetimedb";
export default {
  id: __t.u32(),
  completed: __t.option(__t.option(__t.bool())),
  priority: __t.option(__t.option(__t.string())),
  projectId: __t.option(__t.f64()),
  title: __t.option(__t.string()),
  assigneeId: __t.option(__t.option(__t.identity())),
  expectedUpdatedAt: __t.option(__t.timestamp()),
};
