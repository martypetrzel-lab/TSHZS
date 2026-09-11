ALTER TABLE "Inspection"
  ADD COLUMN "scheduledFor" TIMESTAMP(3),
  ADD COLUMN "performedAt" TIMESTAMP(3),
  ADD COLUMN "cancellationReason" TEXT;

ALTER TABLE "Protocol"
  ADD COLUMN "protocolDate" TIMESTAMP(3),
  ADD COLUMN "cancelledById" TEXT;

CREATE INDEX "Inspection_scheduledFor_state_idx" ON "Inspection"("scheduledFor", "state");
CREATE INDEX "Protocol_protocolDate_cancelledAt_idx" ON "Protocol"("protocolDate", "cancelledAt");

CREATE OR REPLACE FUNCTION prevent_closed_inspection_rewrite() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD."state" IN ('CLOSED', 'CANCELLED', 'CORRECTED') THEN
      RAISE EXCEPTION 'Uzavřenou kontrolu nelze odstranit';
    END IF;
    RETURN OLD;
  END IF;
  IF OLD."state" IN ('CLOSED', 'CANCELLED', 'CORRECTED') THEN
    IF OLD."snapshot" IS NULL AND NEW."snapshot" IS NOT NULL THEN
      IF (to_jsonb(NEW) - ARRAY['state','correctionReason','cancellationReason','cancelledAt','cancelledById','snapshot']) IS DISTINCT FROM (to_jsonb(OLD) - ARRAY['state','correctionReason','cancellationReason','cancelledAt','cancelledById','snapshot']) THEN
        RAISE EXCEPTION 'Uzavřenou kontrolu nelze přepsat; vytvořte storno nebo opravný záznam';
      END IF;
    ELSIF (to_jsonb(NEW) - ARRAY['state','correctionReason','cancellationReason','cancelledAt','cancelledById']) IS DISTINCT FROM (to_jsonb(OLD) - ARRAY['state','correctionReason','cancellationReason','cancelledAt','cancelledById']) THEN
      RAISE EXCEPTION 'Uzavřenou kontrolu nelze přepsat; vytvořte storno nebo opravný záznam';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
