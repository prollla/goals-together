import bridge, { UserInfo } from '@vkontakte/vk-bridge';
import { Avatar, Button, Div, Group as VKGroup, Header, IconButton, Panel, PanelHeader, Progress } from '@vkontakte/vkui';
import { Icon20Check, Icon24ShareOutline, Icon28AddOutline, Icon28ShareOutline, Icon28Users3Outline } from '@vkontakte/icons';
import { Goal, GoalParticipant, NavIdProps } from '../types';
import { formatNumber, formatStreakUnit, getCurrentValue, getDoneDays, getProgress, getStreak, isDone, plural, toDateKey } from '../utils/goals';
import { createGoalInviteLink } from '../utils/invite';
import { getApiUserId } from '../api';
import { GoalTypeIcon } from '../components/GoalTypeIcon';

interface GroupProps extends NavIdProps {
  goals: Goal[];
  fetchedUser?: UserInfo;
  onCreateGoal: () => void;
  serverError: string;
  onNotice: (message: string) => void;
}

// Own class names on every text node: VKUI 8 typography classes are internal (vkuiTitle__level1 …) and not stable.
export const Group = ({ id, goals, fetchedUser, onCreateGoal, serverError, onNotice: setNotice }: GroupProps) => {
  const sharedGoals = goals.filter((goal) => goal.privacy === 'group');
  const currentUserId = getApiUserId(fetchedUser);
  const today = toDateKey();

  const share = async (goal: Goal) => {
    const link = createGoalInviteLink(goal);
    try {
      if (bridge.isWebView()) {
        await bridge.send('VKWebAppShare', { link });
      } else if (navigator.share) {
        await navigator.share({ title: goal.title, text: 'Присоединяйся к моей цели. Мы увидим прогресс друг друга.', url: link });
      } else {
        await navigator.clipboard.writeText(link);
        setNotice('Приглашение скопировано. Отправьте его другу.');
      }
    } catch {
      setNotice('Не удалось отправить приглашение. Попробуйте ещё раз.');
    }
  };

  const participantSummary = (goal: Goal, participant: GoalParticipant) => {
    const participantGoal = { ...goal, entries: participant.entries };
    if (goal.type === 'quantity') {
      return `${formatNumber(getCurrentValue(participantGoal))} из ${formatNumber(goal.target || 0)} ${goal.unit || ''}`.trim();
    }
    const days = getDoneDays(participantGoal);
    return `${days} ${plural(days, ['успешный день', 'успешных дня', 'успешных дней'])}`;
  };

  return (
    <Panel id={id}>
      <PanelHeader>Группа</PanelHeader>
      <Div>
        <section className="group-hero">
          <div className="group-hero__top">
            <span className="group-hero__icon"><Icon28Users3Outline /></span>
            <span className="group-hero__eyebrow">Одна цель — свой прогресс</span>
          </div>
          <h2 className="group-hero__title">Поддерживайте друг друга</h2>
          <p className="group-hero__text">Каждый отмечает свои дни, а прогресс друзей виден здесь.</p>
          {/* With several goals the hero cannot know which one to share: each card has its own invite button. */}
          {sharedGoals.length === 1 ? (
            <Button className="group-invite" size="m" mode="secondary" before={<Icon28ShareOutline width={20} height={20} />} onClick={() => share(sharedGoals[0])}>
              Пригласить друга
            </Button>
          ) : (
            <Button className="group-invite" size="m" mode="secondary" before={<Icon28AddOutline width={20} height={20} />} onClick={onCreateGoal}>
              {sharedGoals.length ? 'Новая общая цель' : 'Создать общую цель'}
            </Button>
          )}
        </section>
      </Div>

      {serverError && (
        <Div>
          <div className="server-banner" role="alert">Не удалось обновить общие цели: {serverError}</div>
        </Div>
      )}

      {sharedGoals.length > 0 && (
        <VKGroup mode="plain" header={<Header size="s">Общие цели · {sharedGoals.length}</Header>}>
          <Div className="shared-goals-list">
            {sharedGoals.map((goal) => {
              const participants = [...(goal.participants || [])].sort((left, right) =>
                Number(right.userId === currentUserId) - Number(left.userId === currentUserId));
              const doneToday = participants.filter((participant) => isDone(participant.entries[today])).length;
              const count = participants.length || 1;
              return (
                <article className={`shared-goal goal-card--${goal.color}`} key={goal.id}>
                  <header className="shared-goal__header">
                    <span className="shared-goal__icon"><GoalTypeIcon type={goal.type} size={22} /></span>
                    <div className="shared-goal__heading">
                      <h3 className="shared-goal__title">{goal.title}</h3>
                      <span className="shared-goal__meta">
                        {count} {plural(count, ['участник', 'участника', 'участников'])} · сегодня {doneToday} из {count}
                      </span>
                    </div>
                    <IconButton label="Пригласить в эту цель" onClick={() => share(goal)} className="shared-goal__share">
                      <Icon24ShareOutline />
                    </IconButton>
                  </header>

                  <ul className="member-list">
                    {participants.map((participant) => {
                      const isMe = participant.userId === currentUserId;
                      const done = isDone(participant.entries[today]);
                      const participantGoal = { ...goal, entries: participant.entries };
                      const progress = getProgress(participantGoal);
                      const streak = getStreak(participantGoal);
                      return (
                        <li className="member-row" key={participant.userId}>
                          <Avatar size={40} src={participant.photoUrl} initials={(isMe ? 'Вы' : participant.firstName).slice(0, 1)} gradientColor="blue" />
                          <div className="member-row__body">
                            <div className="member-row__top">
                              <span className="member-row__name">{isMe ? 'Вы' : participant.firstName}</span>
                              <span className="member-row__percent">
                                {progress !== null ? `${progress}%` : `серия ${streak} ${formatStreakUnit(goal, streak)}`}
                              </span>
                            </div>
                            {progress !== null && <Progress value={progress} aria-label={`Прогресс: ${isMe ? 'вы' : participant.firstName}`} />}
                            <div className="member-row__bottom">
                              <span className={`member-row__status ${done ? 'member-row__status--done' : ''}`}>
                                {done && <Icon20Check width={14} height={14} />}
                                {done ? 'Отмечено сегодня' : 'Сегодня без отметки'}
                              </span>
                              <span className="member-row__summary">{participantSummary(goal, participant)}</span>
                            </div>
                          </div>
                        </li>
                      );
                    })}
                  </ul>

                  {count === 1 && (
                    <button type="button" className="shared-goal__invite-hint" onClick={() => share(goal)}>
                      <Icon28AddOutline width={20} height={20} />
                      Пригласить друга в цель
                    </button>
                  )}
                </article>
              );
            })}
          </Div>
        </VKGroup>
      )}

      {sharedGoals.length === 0 && (
        <Div>
          <div className="empty-state">
            <h3 className="empty-state__title">Пока нет общих целей</h3>
            <p className="empty-state__text">Создайте цель с друзьями и отправьте приглашение. Когда друзья присоединятся, здесь появится их прогресс.</p>
          </div>
        </Div>
      )}

      <Div>
        <p className="group-footnote">Каждый отмечает только свой прогресс. Данные участников обновляются автоматически.</p>
      </Div>
    </Panel>
  );
};
