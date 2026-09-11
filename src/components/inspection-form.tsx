"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { closeInspection, saveInspectionDraft } from "@/app/actions/inspection";

type Item = {
  id: string;
  label: string;
  responseType: string;
  required: boolean;
  allowNotApplicable: boolean;
  naRequiresReason: boolean;
  failRequiresNote: boolean;
  failRequiresPhoto: boolean;
  critical: boolean;
  unit: string | null;
  optionsJson: unknown;
  conditionJson: unknown;
};
type Section = { id: string; title: string; items: Item[] };
type Props = {
  draftId: string;
  sections: Section[];
  initial: Record<string, { value?: unknown; state?: string; reason?: string }>;
  allowLimitation: boolean;
  nonCriticalFailureResult: string;
  header: {
    name: string;
    uid: string;
    placement: string;
    requirement: string;
    checklist: string;
    version: number;
  };
  error?: string;
};

function clientFailed(item: Item, value: string) {
  if (value === "NEVYHOVUJE") return true;
  const options = item.optionsJson as {
    failWhen?: unknown;
    min?: number;
    max?: number;
    targetMin?: number;
  } | null;
  if (item.responseType === "BOOLEAN")
    return options?.failWhen !== undefined
      ? String(options.failWhen) === value
      : value === "false";
  if (["NUMBER", "MEASUREMENT"].includes(item.responseType) && value !== "") {
    const number = Number(value);
    return (
      (options?.min != null && number < options.min) ||
      (options?.targetMin != null && number < options.targetMin) ||
      (options?.max != null && number > options.max)
    );
  }
  return false;
}

export function InspectionForm({
  draftId,
  sections,
  initial,
  allowLimitation,
  nonCriticalFailureResult,
  header,
  error,
}: Props) {
  const formRef = useRef<HTMLFormElement>(null);
  const [dirty, setDirty] = useState(false);
  const [message, setMessage] = useState("");
  const [pending, startTransition] = useTransition();
  const [answers, setAnswers] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      Object.entries(initial).map(([id, value]) => [
        id,
        value.state === "NERELEVANTNI" ? "NA" : String(value.value ?? ""),
      ]),
    ),
  );
  const required = sections.flatMap((s) => s.items).filter((i) => i.required);
  const completed = required.filter(
    (i) => answers[i.id] && answers[i.id] !== "",
  ).length;
  const percent = required.length
    ? Math.round((completed / required.length) * 100)
    : 100;
  const computed = useMemo(() => {
    const failed = sections
      .flatMap((s) => s.items)
      .filter((i) => clientFailed(i, answers[i.id] ?? ""));
    if (!failed.length) return "VYHOVUJE";
    if (failed.some((i) => i.critical)) return "NEVYHOVUJE";
    return allowLimitation &&
      nonCriticalFailureResult === "PASSED_WITH_LIMITATION"
      ? "VYHOVUJE S OMEZENÍM"
      : "NEVYHOVUJE";
  }, [answers, allowLimitation, nonCriticalFailureResult, sections]);
  const save = (manual = false) => {
    if (!formRef.current) return;
    const data = new FormData(formRef.current);
    const fileInputs = [
      ...formRef.current.querySelectorAll<HTMLInputElement>(
        'input[type="file"]',
      ),
    ];
    if (!manual && fileInputs.some((input) => input.files?.length)) {
      setMessage("Čeká fotografie – použijte Uložit rozpracované.");
      return;
    }
    startTransition(async () => {
      const result = await saveInspectionDraft(data);
      setMessage(result.message);
      if (result.ok) {
        setDirty(false);
        if (manual)
          fileInputs.forEach((input) => {
            input.value = "";
          });
      }
    });
  };
  useEffect(() => {
    const timer = window.setInterval(() => {
      if (dirty) save();
    }, 30_000);
    return () => window.clearInterval(timer);
  });
  const onChange = (event: React.ChangeEvent<HTMLFormElement>) => {
    setDirty(true);
    const target = event.target as unknown as
      HTMLInputElement | HTMLSelectElement;
    if (target.name.startsWith("answer-"))
      setAnswers((old) => ({ ...old, [target.name.slice(7)]: target.value }));
    if (target.name.startsWith("na-"))
      setAnswers((old) => ({
        ...old,
        [target.name.slice(3)]: (target as HTMLInputElement).checked
          ? "NA"
          : "",
      }));
  };
  return (
    <form
      ref={formRef}
      action={closeInspection}
      onChange={onChange}
      className="inspection-mobile-form"
    >
      <input type="hidden" name="draftId" value={draftId} />
      <header className="card inspection-form-header">
        <div>
          <span>Rozpracovaná kontrola</span>
          <h1>{header.name}</h1>
          <p>
            {header.uid} · {header.placement}
          </p>
        </div>
        <div>
          <strong>{header.requirement}</strong>
          <small>
            {header.checklist}, verze {header.version}
          </small>
        </div>
      </header>
      {(error || message) && (
        <div
          className={error ? "error import-error" : "card save-message"}
          role="status"
        >
          {error || message}
        </div>
      )}
      <div className="inspection-progress">
        <div>
          <strong>{percent} %</strong>
          <span>{required.length - completed} povinných bodů zbývá</span>
        </div>
        <progress max="100" value={percent} />
      </div>
      {sections.map((section, sectionIndex) => {
        const previousFailed =
          sectionIndex > 0 &&
          sections[sectionIndex - 1].items.some((i) =>
            clientFailed(i, answers[i.id] ?? ""),
          );
        const condition = section.items[0]?.conditionJson as {
          stopWhenPreviousSectionFailed?: boolean;
          showWhenAnyFailed?: boolean;
        } | null;
        const anyFailed = sections
          .flatMap((s) => s.items)
          .some((i) => clientFailed(i, answers[i.id] ?? ""));
        if (condition?.showWhenAnyFailed && !anyFailed) return null;
        const blocked = Boolean(
          condition?.stopWhenPreviousSectionFailed && previousFailed,
        );
        return (
          <fieldset
            className="card inspection-section"
            key={section.id}
            disabled={blocked}
          >
            <legend>{section.title}</legend>
            {blocked && (
              <div className="inspection-blocked">
                Tato část se neprovádí, protože předchozí prohlídka zjistila
                závadu.
              </div>
            )}
            {section.items.map((item) => (
              <ChecklistControl
                item={item}
                initial={initial[item.id]}
                value={answers[item.id] ?? ""}
                key={item.id}
              />
            ))}
          </fieldset>
        );
      })}
      {allowLimitation && (
        <label className="card field">
          <span>Důvod omezení (povinný, pokud checklist vyjde s omezením)</span>
          <textarea name="limitationReason" defaultValue="" />
        </label>
      )}
      <label className="card field">
        <span>Celková poznámka</span>
        <textarea name="note" />
      </label>
      <section className="card inspection-summary">
        <h2>Vypočtený výsledek</h2>
        <strong
          className={
            computed === "NEVYHOVUJE" ? "result-failed" : "result-passed"
          }
        >
          {computed}
        </strong>
        <dl>
          <div>
            <dt>Prostředek</dt>
            <dd>
              {header.name} · {header.uid}
            </dd>
          </div>
          <div>
            <dt>Povinnost</dt>
            <dd>{header.requirement}</dd>
          </div>
          <div>
            <dt>Checklist</dt>
            <dd>
              {header.checklist}, verze {header.version}
            </dd>
          </div>
        </dl>
        <label className="confirm-check">
          <input type="checkbox" name="confirmed" required /> Potvrzuji, že jsem
          kontrolu provedl/a a uvedené údaje odpovídají skutečnosti.
        </label>
        <small>
          Potvrzení je evidováno v aplikaci; nejde o kvalifikovaný elektronický
          podpis.
        </small>
      </section>
      <div className="inspection-sticky">
        <div>
          <strong>{percent} %</strong>
          <span>
            {pending ? "Ukládám…" : dirty ? "Neuložené změny" : "Uloženo"}
          </span>
        </div>
        <button
          type="button"
          className="button secondary"
          disabled={pending}
          onClick={() => save(true)}
        >
          Uložit rozpracované
        </button>
        <button className="button" disabled={pending}>
          Uzavřít kontrolu
        </button>
      </div>
    </form>
  );
}

function ChecklistControl({
  item,
  initial,
  value,
}: {
  item: Item;
  initial?: { value?: unknown; state?: string; reason?: string };
  value: string;
}) {
  const common = {
    name: `answer-${item.id}`,
    defaultValue: String(initial?.value ?? ""),
  };
  const choices =
    item.responseType === "PASS_FAIL_NA"
      ? [
          ["", "Vyberte"],
          ["VYHOVUJE", "Vyhovuje"],
          ["NEVYHOVUJE", "Nevyhovuje"],
        ]
      : [
          ["", "Vyberte"],
          ["VYHOVUJE", "Vyhovuje"],
          ["NEVYHOVUJE", "Nevyhovuje"],
        ];
  return (
    <div className={`inspection-question ${item.critical ? "critical" : ""}`}>
      <div className="question-label">
        <strong>
          {item.label}
          {item.required && " *"}
        </strong>
        {item.critical && <span>Kritický bod</span>}
      </div>
      {["PASS_FAIL", "PASS_FAIL_NA"].includes(item.responseType) && (
        <div className="answer-buttons">
          {choices.slice(1).map(([v, l]) => (
            <label key={v}>
              <input
                type="radio"
                name={common.name}
                value={v}
                defaultChecked={initial?.value === v}
              />
              <span>{l}</span>
            </label>
          ))}
        </div>
      )}
      {item.responseType === "BOOLEAN" && (
        <select {...common}>
          <option value="">Vyberte</option>
          <option value="true">Ano</option>
          <option value="false">Ne</option>
        </select>
      )}
      {["TEXT", "NUMBER", "DATE", "MEASUREMENT"].includes(
        item.responseType,
      ) && (
        <div className="measurement">
          <input
            {...common}
            type={
              item.responseType === "DATE"
                ? "date"
                : item.responseType === "TEXT"
                  ? "text"
                  : "number"
            }
            step="any"
          />
          <span>{item.unit}</span>
        </div>
      )}
      {item.responseType === "TEXTAREA" && <textarea {...common} />}
      {item.responseType === "SELECT" && (
        <select {...common}>
          <option value="">Vyberte</option>
          {((item.optionsJson as { options?: string[] })?.options ?? []).map(
            (o) => (
              <option key={o}>{o}</option>
            ),
          )}
        </select>
      )}
      {item.responseType === "PHOTO" && (
        <input
          type="file"
          name={`photo-${item.id}`}
          accept="image/*"
          capture="environment"
        />
      )}
      {item.allowNotApplicable && (
        <label className="na-choice">
          <input
            type="checkbox"
            name={`na-${item.id}`}
            defaultChecked={initial?.state === "NERELEVANTNI"}
          />{" "}
          Nerelevantní
        </label>
      )}
      {(value === "NEVYHOVUJE" ||
        value === "NA" ||
        item.failRequiresNote ||
        item.naRequiresReason) && (
        <input
          name={`reason-${item.id}`}
          defaultValue={initial?.reason ?? ""}
          placeholder={
            value === "NA" ? "Důvod nerelevantnosti" : "Poznámka / popis závady"
          }
        />
      )}
      {(value === "NEVYHOVUJE" || item.failRequiresPhoto) && (
        <label className="photo-upload">
          Fotografie
          <input
            type="file"
            name={`photo-${item.id}`}
            accept="image/*"
            capture="environment"
            multiple
          />
        </label>
      )}
    </div>
  );
}
