import { FormEvent, useState } from 'react';
import { Button, Caption, Div, FormItem, FormLayoutGroup, Input, Panel, PanelHeader, PanelHeaderBack, Radio, RadioGroup, Select, Textarea, Title } from '@vkontakte/vkui';
import { useSafeBack } from '../hooks/useSafeBack';
import { GoalColor, GoalDraft, GoalFrequency, GoalPrivacy, GoalTemplate, GoalType, NavIdProps } from '../types';
import { GoalTypeIcon } from '../components/GoalTypeIcon';

interface CreateGoalProps extends NavIdProps {
  template?: GoalTemplate;
  onCreate: (draft: GoalDraft) => Promise<void> | void;
}

const typeOptions: { type: GoalType; title: string; subtitle: string }[] = [
  { type: 'quit', title: 'Отказаться', subtitle: 'Отмечать дни без привычки' },
  { type: 'regular', title: 'Делать регулярно', subtitle: 'Формировать полезный ритуал' },
  { type: 'quantity', title: 'Достичь результата', subtitle: 'Двигаться к числовой цели' },
];

const colors: GoalColor[] = ['violet', 'green', 'orange', 'blue'];

export const CreateGoal = ({ id, template, onCreate }: CreateGoalProps) => {
  const goBack = useSafeBack();
  const [type, setType] = useState<GoalType>(template?.type || 'regular');
  const [title, setTitle] = useState(template?.title || '');
  const [rule, setRule] = useState(template?.rule || '');
  const [category, setCategory] = useState(template?.category || 'Развитие');
  const [color, setColor] = useState<GoalColor>(template?.color || 'violet');
  const [duration, setDuration] = useState(String(template?.duration ?? 30));
  const [frequency, setFrequency] = useState<GoalFrequency>(template?.frequency || 'daily');
  const [weeklyTarget, setWeeklyTarget] = useState(String(template?.weeklyTarget || 3));
  const [target, setTarget] = useState(String(template?.target || 100));
  const [unit, setUnit] = useState(template?.unit || 'раз');
  const [privacy, setPrivacy] = useState<GoalPrivacy>('private');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (submitting) return;
    if (!title.trim()) {
      setError('Добавьте название цели');
      return;
    }
    if (type === 'quantity' && (Number(target) <= 0 || !unit.trim())) {
      setError('Укажите целевое значение и единицу измерения');
      return;
    }
    const weeklyCount = Number(weeklyTarget);
    if (type !== 'quantity' && frequency === 'weekly' && (!Number.isInteger(weeklyCount) || weeklyCount < 1 || weeklyCount > 7)) {
      setError('Укажите, сколько раз в неделю: от 1 до 7');
      return;
    }

    setSubmitting(true);
    try {
      await onCreate({
      title: title.trim(),
      rule: rule.trim() || 'Отмечать прогресс каждый день',
      category,
      type,
      color,
      duration: Number(duration),
      frequency,
      weeklyTarget: frequency === 'weekly' ? Number(weeklyTarget) : undefined,
      target: type === 'quantity' ? Number(target) : undefined,
      unit: type === 'quantity' ? unit.trim() : undefined,
      privacy,
      });
    } finally {
      setSubmitting(false);
    }
  };

  const changeType = (nextType: GoalType) => {
    setType(nextType);
    setError('');
  };

  return (
    <Panel id={id}>
      <PanelHeader before={<PanelHeaderBack onClick={goBack} />}>{template ? 'Настройка цели' : 'Новая цель'}</PanelHeader>
      <form onSubmit={(event) => void submit(event)}>
        <Div className="create-intro">
          <Title level="2" weight="2">Какую цель хотите достичь?</Title>
          <Caption>Сформулируйте понятное правило — его будет легко отметить.</Caption>
        </Div>
        <Div className="goal-type-selector">
          {typeOptions.map((option) => (
            <button key={option.type} type="button" className={`goal-type ${type === option.type ? 'goal-type--active' : ''}`} onClick={() => changeType(option.type)}>
              <GoalTypeIcon type={option.type} size={26} />
              <span><strong>{option.title}</strong><small>{option.subtitle}</small></span>
            </button>
          ))}
        </Div>
        <FormLayoutGroup mode="vertical">
          <Div className="form-section">
            <FormItem top="Название" required status={error && !title.trim() ? 'error' : 'default'}>
              <Input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Например, читать каждый день" maxLength={80} />
            </FormItem>
            <FormItem top="Правило выполнения">
              <Textarea value={rule} onChange={(event) => setRule(event.target.value)} placeholder="Что нужно сделать, чтобы отметить день?" maxLength={180} />
            </FormItem>
            <FormItem top="Категория">
              <Select value={category} onChange={(event) => setCategory(event.target.value)} options={['Здоровье', 'Отказ', 'Развитие', 'Финансы и порядок'].map((value) => ({ label: value, value }))} />
            </FormItem>
            {type !== 'quantity' && (
              <FormItem top="Расписание">
                <Select value={frequency} onChange={(event) => setFrequency(event.target.value as GoalFrequency)} options={[
                  { label: 'Каждый день', value: 'daily' },
                  { label: 'По будням', value: 'weekdays' },
                  { label: 'Несколько раз в неделю', value: 'weekly' },
                ]} />
              </FormItem>
            )}
            {type !== 'quantity' && frequency === 'weekly' && (
              <FormItem top="Сколько раз в неделю">
                <Input type="number" min="1" max="7" value={weeklyTarget} onChange={(event) => setWeeklyTarget(event.target.value)} />
              </FormItem>
            )}
            <FormItem top="Срок">
              <Select value={duration} onChange={(event) => setDuration(event.target.value)} options={[
                { label: '7 дней', value: '7' },
                { label: '14 дней', value: '14' },
                { label: '30 дней', value: '30' },
                { label: 'Без ограничения', value: '0' },
              ]} />
            </FormItem>
            {type === 'quantity' && (
              <FormLayoutGroup mode="horizontal">
                <FormItem top="Целевое значение">
                  <Input type="number" min="1" value={target} onChange={(event) => setTarget(event.target.value)} />
                </FormItem>
                <FormItem top="Единица">
                  <Input value={unit} onChange={(event) => setUnit(event.target.value)} placeholder="км, страниц, ₽" maxLength={16} />
                </FormItem>
              </FormLayoutGroup>
            )}
            <FormItem top="Цвет карточки">
              <div className="color-picker">
                {colors.map((item) => (
                  <button key={item} type="button" aria-label={`Выбрать ${item} цвет`} className={`color-dot color-dot--${item} ${color === item ? 'color-dot--active' : ''}`} onClick={() => setColor(item)} />
                ))}
              </div>
            </FormItem>
          </Div>
          <Div className="form-section">
            <FormItem top="Кто увидит прогресс" />
            <RadioGroup mode="vertical">
              <Radio name="privacy" value="private" checked={privacy === 'private'} onChange={() => setPrivacy('private')} description="Прогресс видите только вы">Личная цель</Radio>
              <Radio name="privacy" value="group" checked={privacy === 'group'} onChange={() => setPrivacy('group')} description="У каждого свой прогресс, результаты видны участникам">Цель с друзьями</Radio>
            </RadioGroup>
            {error && <Caption className="form-error">{error}</Caption>}
            <Button stretched size="l" type="submit" className="submit-goal" loading={submitting} disabled={submitting}>Создать цель</Button>
          </Div>
        </FormLayoutGroup>
      </form>
    </Panel>
  );
};
