import MCFragment from './MCFragment';
import { mcFragments } from './mcSourcePort';

export default function MCRightSidebar() {
  return <MCFragment html={mcFragments.rightSidebar} testId="mc-right-sidebar" />;
}
