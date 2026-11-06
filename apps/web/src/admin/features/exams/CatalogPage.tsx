import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { createCategory, createTopic, deleteCategory, deleteTopic, getCategories, getTopics, keys, patchCategory, patchTopic } from '../../api/admin';
import { contentKeys, getCountryOptions, reorderCategories } from '../../api/content';
import type { CategoryRow, TopicRow } from '../../api/types';
import { ActionDialog } from '../../components/ActionDialog';
import { AdminShell } from '../../components/AdminShell';
import { CheckField, SelectField, TextField } from '../../components/forms';
import { EmptyState, ErrorBox, Loader } from '../../components/states';
import { useToast } from '../../components/Toast';
import { Btn, Pill } from '../../components/ui';
import { allowedCountryCodes, useAdminCountry } from '../../lib/adminCountry';
import { describeAdminError } from '../../lib/apiErrors';
import { countryName, plural } from '../../lib/format';
import { denyHint } from '../../lib/permissions';
import { useIsDesktop } from '../../lib/useMediaQuery';
import { useAdmin } from '../auth/session';
import { blockedByCounts, checkName, guarded, idsAfterMove, movedAnnouncement } from './catalogModel';

const card = 'flex min-w-0 flex-col gap-3 rounded-[16px] border border-border bg-white p-5 max-[899px]:rounded-[14px] max-[899px]:p-4';

interface CategoryDraft { id?: string; countryCode: string; name: string; description: string; icon: string; featured: boolean }

/**
 * Categories and topics (A7), `/admin/exams/catalog`. Categories per country: create, edit, reorder, delete with the
 * "used by N" guard. Topics per category (the unit of weak-area results): add, rename, delete with the same guard.
 * Sections of one test are edited on that test's page (`/admin/exams/:id/edit`).
 */
export function CatalogPage() {
  const admin = useAdmin();
  const qc = useQueryClient();
  const toast = useToast();
  const isDesktop = useIsDesktop();
  const { country: filter } = useAdminCountry();
  const hint = denyHint(admin.permissions, 'exams:write', 'change categories and topics');
  const options = useQuery({ queryKey: contentKeys.countryOptions, queryFn: getCountryOptions, staleTime: 5 * 60_000 });
  const countries = useMemo(() => options.data?.map((c) => c.code) ?? allowedCountryCodes(admin.countryScope), [options.data, admin.countryScope]);
  const [country, setCountry] = useState(filter ?? '');
  useEffect(() => {
    if (!country || !countries.includes(country)) setCountry(filter && countries.includes(filter) ? filter : (countries[0] ?? ''));
  }, [country, countries, filter]);

  const cats = useQuery({ queryKey: keys.categories(country), queryFn: () => getCategories(country), enabled: !!country });
  const [order, setOrder] = useState<CategoryRow[]>([]);
  useEffect(() => setOrder(cats.data ?? []), [cats.data]);
  const [topicCat, setTopicCat] = useState('');
  useEffect(() => {
    if (!order.some((c) => c.id === topicCat)) setTopicCat(order[0]?.id ?? '');
  }, [order, topicCat]);
  const [live, setLive] = useState('');

  const [catDialog, setCatDialog] = useState<CategoryDraft | null>(null);
  const [catDelete, setCatDelete] = useState<CategoryRow | null>(null);
  const catErrors = useRef<Record<string, string>>({});
  const [tried, setTried] = useState(false);

  const refreshCats = () => Promise.all([qc.invalidateQueries({ queryKey: ['admin', 'categories'] }), qc.invalidateQueries({ queryKey: keys.catalog }), qc.invalidateQueries({ queryKey: ['admin', 'exams'] })]);

  const move = async (i: number, to: number) => {
    const ids = idsAfterMove(order, i, to);
    const before = order;
    const byId = new Map(order.map((c) => [c.id, c]));
    setOrder(ids.map((id) => byId.get(id)!));
    try {
      await reorderCategories(country, ids);
      setLive(movedAnnouncement(before[i]!.name, to + 1, before.length));
      void refreshCats();
    } catch (e) {
      setOrder(before);
      toast({ tone: 'error', text: describeAdminError(e) });
    }
  };

  const nameProblem = catDialog && tried ? checkName(catDialog.name) : undefined;

  const countrySelect = (
    <SelectField label="Country" value={country} onChange={(e) => setCountry(e.target.value)} className="max-w-[260px]">
      {countries.map((c) => <option key={c} value={c}>{countryName(c)}</option>)}
    </SelectField>
  );

  const categoryList = (
    <section aria-labelledby="cg-cats" className={card}>
      <div className="flex flex-wrap items-center justify-between gap-2.5">
        <h2 id="cg-cats" className="m-0 text-[17px]">Categories · {countryName(country)}</h2>
        <Btn kind="outline-brand" size="sm" whyDisabled={hint} onClick={() => { setTried(false); setCatDialog({ countryCode: country, name: '', description: '', icon: '', featured: false }); }}>+ Add a category</Btn>
      </div>
      <p className="m-0 text-[13px] text-muted">Categories are the job areas candidates choose from. The order here is the order they see. One category per country can be featured.</p>
      <p role="status" className="sr-only">{live}</p>
      {cats.isPending ? <Loader label="Loading categories…" className="-mx-5" /> : cats.isError ? <ErrorBox error={cats.error} onRetry={() => void cats.refetch()} /> : order.length === 0 ? (
        <EmptyState title="No categories yet" hint="Add the first category of this country." />
      ) : (
        <ol className="m-0 flex list-none flex-col p-0">
          {order.map((c, i) => {
            const blocked = blockedByCounts({ mockTests: c.mockTests, topics: c.topics, professions: c.professions }, 'category', 'Move or remove those first.');
            return (
              <li key={c.id} className="flex flex-col gap-2 border-t border-soft py-3 first:border-t-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold">{i + 1}. {c.name}</span>
                  {c.featured && <Pill tone={{ bg: '#E8EFFB', ink: '#164A7A' }}>Featured</Pill>}
                </div>
                <span className="text-[13px] text-muted">
                  {c.description || 'No description'}{c.icon ? ` · icon: ${c.icon}` : ''} · {plural(c.mockTests, 'mock test')} · {plural(c.topics, 'topic')} · {plural(c.professions, 'profession')}
                </span>
                <div className="flex flex-wrap gap-1.5">
                  <Btn size="sm" aria-pressed={topicCat === c.id} onClick={() => setTopicCat(c.id)} className={topicCat === c.id ? 'border-brand bg-brand-soft text-brand' : ''}>Topics</Btn>
                  {!hint && (
                    <>
                      <Btn size="sm" aria-label={`Move ${c.name} up`} disabled={i === 0} onClick={() => void move(i, i - 1)}>↑</Btn>
                      <Btn size="sm" aria-label={`Move ${c.name} down`} disabled={i === order.length - 1} onClick={() => void move(i, i + 1)}>↓</Btn>
                      <Btn size="sm" aria-label={`Edit ${c.name}`} onClick={() => { setTried(false); setCatDialog({ id: c.id, countryCode: c.countryCode, name: c.name, description: c.description, icon: c.icon, featured: c.featured }); }}>Edit</Btn>
                      <Btn size="sm" kind="danger" aria-label={`Delete ${c.name}`} whyDisabled={blocked} onClick={() => { catErrors.current = {}; setCatDelete(c); }}>Delete</Btn>
                    </>
                  )}
                </div>
              </li>
            );
          })}
        </ol>
      )}

      <ActionDialog
        open={!!catDialog}
        onClose={() => setCatDialog(null)}
        title={catDialog?.id ? 'Edit category' : 'Add a category'}
        confirmLabel={catDialog?.id ? 'Save category' : 'Add category'}
        reason={false}
        note={null}
        fieldsOk={!!catDialog && !checkName(catDialog.name)}
        fieldsError="Write a name for the category."
        fields={catDialog && (
          <>
            {!catDialog.id && (
              <SelectField label="Country" value={catDialog.countryCode} onChange={(e) => setCatDialog({ ...catDialog, countryCode: e.target.value })}>
                {countries.map((c) => <option key={c} value={c}>{countryName(c)}</option>)}
              </SelectField>
            )}
            <TextField label="Name" value={catDialog.name} error={nameProblem} onChange={(e) => { setTried(true); setCatDialog({ ...catDialog, name: e.target.value }); }} />
            <TextField label="Description" optional maxLength={300} value={catDialog.description} onChange={(e) => setCatDialog({ ...catDialog, description: e.target.value })} />
            <TextField label="Icon" optional maxLength={40} value={catDialog.icon} hint="The icon's name, for example book or briefcase." onChange={(e) => setCatDialog({ ...catDialog, icon: e.target.value })} />
            <CheckField label="Featured" checked={catDialog.featured} hint="Shown first on the landing page. Featuring this one un-features the other in this country." onChange={(e) => setCatDialog({ ...catDialog, featured: e.target.checked })} />
          </>
        )}
        submit={async () => {
          if (!catDialog) return;
          const body = { name: catDialog.name.trim(), description: catDialog.description.trim(), icon: catDialog.icon.trim(), featured: catDialog.featured };
          if (catDialog.id) await patchCategory(catDialog.id, body);
          else await createCategory({ ...body, countryCode: catDialog.countryCode });
        }}
        onDone={() => {
          toast({ text: catDialog?.id ? 'Category saved.' : 'Category added.' });
          void refreshCats();
        }}
      />

      <ActionDialog
        open={!!catDelete}
        onClose={() => setCatDelete(null)}
        title={`Delete the category “${catDelete?.name ?? ''}”?`}
        confirmLabel="Delete category"
        kind="danger"
        reason={false}
        errors={catErrors.current}
        note="Deleting is recorded in the audit log. A category that is still used cannot be deleted."
        submit={() => guarded(catErrors.current, 'category_in_use', 'category', 'Move or remove those first.', () => deleteCategory(catDelete!.id))}
        onDone={() => {
          toast({ text: 'Category deleted.' });
          void refreshCats();
        }}
      >
        <p className="m-0">It has no mock tests, topics or professions, so nothing else is affected.</p>
      </ActionDialog>
    </section>
  );

  return (
    <AdminShell title="Categories and topics" back={isDesktop ? undefined : '/admin/exams'}>
      {isDesktop && (
        <div className="flex flex-col gap-1">
          <Link to="/admin/exams" className="self-start text-sm font-semibold">← Exams &amp; questions</Link>
          <h1 className="m-0 text-[28px] tracking-[-0.02em]">Categories and topics</h1>
          <span className="text-sm text-muted">Sections are edited on each mock test’s own page.</span>
        </div>
      )}
      {!isDesktop && <h2 className="sr-only">Categories and topics</h2>}
      {countrySelect}
      {isDesktop ? (
        <div className="flex flex-wrap items-start gap-[18px]">
          <div className="min-w-0 flex-[1_1_420px]">{categoryList}</div>
          <div className="min-w-0 flex-[1_1_360px]"><TopicsCard categories={order} categoryId={topicCat} onCategory={setTopicCat} hint={hint} /></div>
        </div>
      ) : (
        <>
          {categoryList}
          <TopicsCard categories={order} categoryId={topicCat} onCategory={setTopicCat} hint={hint} />
        </>
      )}
    </AdminShell>
  );
}

function TopicsCard({ categories, categoryId, onCategory, hint }: { categories: CategoryRow[]; categoryId: string; onCategory: (id: string) => void; hint?: string }) {
  const qc = useQueryClient();
  const toast = useToast();
  const topics = useQuery({ queryKey: keys.topics(categoryId), queryFn: () => getTopics(categoryId), enabled: !!categoryId });
  const [dialog, setDialog] = useState<null | { id?: string; name: string }>(null);
  const [del, setDel] = useState<TopicRow | null>(null);
  const errors = useRef<Record<string, string>>({});
  const [tried, setTried] = useState(false);
  const category = categories.find((c) => c.id === categoryId);
  const refresh = () => Promise.all([qc.invalidateQueries({ queryKey: ['admin', 'topics'] }), qc.invalidateQueries({ queryKey: ['admin', 'categories'] }), qc.invalidateQueries({ queryKey: keys.catalog })]);
  const nameProblem = dialog && tried ? checkName(dialog.name) : undefined;

  return (
    <section aria-labelledby="cg-topics" className={card}>
      <div className="flex flex-wrap items-center justify-between gap-2.5">
        <h2 id="cg-topics" className="m-0 text-[17px]">Topics{category ? ` · ${category.name}` : ''}</h2>
        <Btn kind="outline-brand" size="sm" disabled={!categoryId} whyDisabled={hint} onClick={() => { setTried(false); setDialog({ name: '' }); }}>+ Add a topic</Btn>
      </div>
      <p className="m-0 text-[13px] text-muted">Topics group questions inside a category. The weak-area results show candidates how they did per topic, so a topic in use cannot be deleted.</p>
      <SelectField label="Category" value={categoryId} onChange={(e) => onCategory(e.target.value)} disabled={categories.length === 0}>
        {categories.length === 0 && <option value="">No categories</option>}
        {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
      </SelectField>
      {!categoryId ? <EmptyState title="Choose a category" hint="Topics belong to a category." /> : topics.isPending ? <Loader label="Loading topics…" className="-mx-5" /> : topics.isError ? <ErrorBox error={topics.error} onRetry={() => void topics.refetch()} /> : topics.data.length === 0 ? (
        <EmptyState title="No topics yet" hint="Questions need a topic, so add one before writing questions." />
      ) : (
        <ul className="m-0 flex list-none flex-col p-0">
          {topics.data.map((t) => {
            const blocked = blockedByCounts({ questions: t.questions }, 'topic', 'Move those questions to another topic first.');
            return (
              <li key={t.id} className="flex flex-col gap-2 border-t border-soft py-3 first:border-t-0 min-[600px]:flex-row min-[600px]:items-center">
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="font-semibold">{t.name}</span>
                  <span className="text-[13px] text-muted">{plural(t.questions, 'question')}</span>
                </span>
                {!hint && (
                  <span className="flex gap-1.5">
                    <Btn size="sm" aria-label={`Rename ${t.name}`} onClick={() => { setTried(false); setDialog({ id: t.id, name: t.name }); }}>Rename</Btn>
                    <Btn size="sm" kind="danger" aria-label={`Delete ${t.name}`} whyDisabled={blocked} onClick={() => { errors.current = {}; setDel(t); }}>Delete</Btn>
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <ActionDialog
        open={!!dialog}
        onClose={() => setDialog(null)}
        title={dialog?.id ? 'Rename topic' : 'Add a topic'}
        confirmLabel={dialog?.id ? 'Save topic' : 'Add topic'}
        reason={false}
        note={null}
        fieldsOk={!!dialog && !checkName(dialog.name)}
        fieldsError="Write a name for the topic."
        fields={dialog && <TextField label="Topic name" value={dialog.name} error={nameProblem} onChange={(e) => { setTried(true); setDialog({ ...dialog, name: e.target.value }); }} />}
        errors={{ topic_exists: 'This category already has a topic with that name.' }}
        submit={async () => {
          if (!dialog) return;
          if (dialog.id) await patchTopic(dialog.id, dialog.name.trim());
          else await createTopic({ categoryId, name: dialog.name.trim() });
        }}
        onDone={() => {
          toast({ text: dialog?.id ? 'Topic saved.' : 'Topic added.' });
          void refresh();
        }}
      />

      <ActionDialog
        open={!!del}
        onClose={() => setDel(null)}
        title={`Delete the topic “${del?.name ?? ''}”?`}
        confirmLabel="Delete topic"
        kind="danger"
        reason={false}
        errors={errors.current}
        note="Deleting is recorded in the audit log. A topic that questions use cannot be deleted."
        submit={() => guarded(errors.current, 'topic_in_use', 'topic', 'Move those questions to another topic first.', () => deleteTopic(del!.id))}
        onDone={() => {
          toast({ text: 'Topic deleted.' });
          void refresh();
        }}
      >
        <p className="m-0">No question uses this topic, so nothing else is affected.</p>
      </ActionDialog>
    </section>
  );
}
