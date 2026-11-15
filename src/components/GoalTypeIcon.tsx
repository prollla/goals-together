import { Icon28CalendarOutline, Icon28CheckCircleOutline, Icon28StatisticsOutline } from '@vkontakte/icons';
import { GoalType } from '../types';

export const GoalTypeIcon = ({ type, size = 24 }: { type: GoalType; size?: number }) => {
  if (type === 'regular') return <Icon28CalendarOutline width={size} height={size} />;
  if (type === 'quantity') return <Icon28StatisticsOutline width={size} height={size} />;
  return <Icon28CheckCircleOutline width={size} height={size} />;
};
