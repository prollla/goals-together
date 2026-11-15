import { useState } from 'react';
import { Button, Caption, Div, Group, Header, Panel, PanelHeader, PanelHeaderBack, Text, Title } from '@vkontakte/vkui';
import { useSafeBack } from '../hooks/useSafeBack';
import { categories, templates } from '../data/templates';
import { GoalTemplate, NavIdProps } from '../types';
import { GoalTypeIcon } from '../components/GoalTypeIcon';

interface CatalogProps extends NavIdProps {
  onSelect: (template: GoalTemplate) => void;
}

const typeNames = {
  quit: 'Отказ от привычки',
  regular: 'Регулярное действие',
  quantity: 'Количественная цель',
};

export const Catalog = ({ id, onSelect }: CatalogProps) => {
  const goBack = useSafeBack();
  const [category, setCategory] = useState('Все');
  const visibleTemplates = templates.filter((template) => category === 'Все' || template.category === category);

  return (
    <Panel id={id}>
      <PanelHeader before={<PanelHeaderBack onClick={goBack} />}>Каталог целей</PanelHeader>
      <Div className="catalog-intro">
        <Title level="2" weight="2">Не начинайте с чистого листа</Title>
        <Text>Выберите отправную точку — детали настроите на следующем шаге.</Text>
      </Div>
      <div className="chips-scroll">
        {categories.map((item) => (
          <button key={item} type="button" className={`filter-chip ${category === item ? 'filter-chip--active' : ''}`} onClick={() => setCategory(item)}>
            {item}
          </button>
        ))}
      </div>
      <Group mode="plain" header={<Header size="s">{category} · {visibleTemplates.length}</Header>}>
        <Div className="template-list">
          {visibleTemplates.map((template) => (
            <article key={template.id} className={`template-card template-card--${template.color}`}>
              <span className="template-card__icon"><GoalTypeIcon type={template.type} /></span>
              <div className="template-card__content">
                <Caption>{template.category} · {typeNames[template.type]}</Caption>
                <Title level="3" weight="2">{template.title}</Title>
                <Text>{template.rule}</Text>
                <Button mode="secondary" size="m" onClick={() => onSelect(template)}>Выбрать шаблон</Button>
              </div>
            </article>
          ))}
        </Div>
      </Group>
    </Panel>
  );
};
