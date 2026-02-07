import MCFragment from './MCFragment';
import { mcFragments } from './mcSourcePort';

export default function MCAgentsView() {
  return <MCFragment html={mcFragments.agentsView} testId="mc-agents-view" />;
}
