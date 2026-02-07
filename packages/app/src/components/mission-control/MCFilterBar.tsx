import MCFragment from './MCFragment';
import { mcFragments } from './mcSourcePort';

export default function MCFilterBar() {
  return <MCFragment html={mcFragments.filterBar} testId="mc-filter-bar" />;
}
