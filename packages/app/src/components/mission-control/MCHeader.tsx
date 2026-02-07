import MCFragment from './MCFragment';
import { mcFragments } from './mcSourcePort';

export default function MCHeader() {
  return <MCFragment html={mcFragments.header} testId="mc-header" />;
}
