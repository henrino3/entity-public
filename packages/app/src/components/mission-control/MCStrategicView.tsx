import MCFragment from './MCFragment';
import { mcFragments } from './mcSourcePort';

export default function MCStrategicView() {
  return <MCFragment html={mcFragments.strategicView} testId="mc-strategic-view" />;
}
