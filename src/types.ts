export type { NavIdProps } from '@vkontakte/vkui';

export type GoalType = 'quit' | 'regular' | 'quantity';
export type GoalColor = 'violet' | 'green' | 'orange' | 'blue';
export type GoalFrequency = 'daily' | 'weekdays' | 'weekly';
export type GoalPrivacy = 'private' | 'group';

export interface GoalEntry {
  status: 'done' | 'skipped';
  value?: number;
}

export interface GoalParticipant {
  userId: string;
  firstName: string;
  photoUrl?: string;
  joinedAt: string;
  entries: Record<string, GoalEntry>;
}

export interface Goal {
  id: string;
  title: string;
  rule: string;
  category: string;
  type: GoalType;
  color: GoalColor;
  createdAt: string;
  duration: number;
  frequency: GoalFrequency;
  weeklyTarget?: number;
  target?: number;
  unit?: string;
  privacy: GoalPrivacy;
  groupId?: string;
  ownerId?: string;
  participants?: GoalParticipant[];
  entries: Record<string, GoalEntry>;
}

export interface GoalTemplate {
  id: string;
  title: string;
  rule: string;
  category: string;
  type: GoalType;
  color: GoalColor;
  duration: number;
  frequency: GoalFrequency;
  weeklyTarget?: number;
  target?: number;
  unit?: string;
}

export type GoalDraft = Omit<Goal, 'id' | 'createdAt' | 'entries'>;
