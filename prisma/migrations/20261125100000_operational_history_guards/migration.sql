CREATE FUNCTION protect_issued_operational_item() RETURNS trigger AS $$
DECLARE parent_status "OperationalProtocolStatus";
BEGIN
  IF TG_OP <> 'INSERT' THEN
    SELECT "status" INTO parent_status FROM "OperationalProtocol" WHERE "id" = OLD."protocolId";
    IF parent_status <> 'DRAFT' THEN RAISE EXCEPTION 'Položky vystaveného dokumentu jsou neměnné'; END IF;
  END IF;
  IF TG_OP <> 'DELETE' THEN
    SELECT "status" INTO parent_status FROM "OperationalProtocol" WHERE "id" = NEW."protocolId";
    IF parent_status <> 'DRAFT' THEN RAISE EXCEPTION 'Do vystaveného dokumentu nelze doplnit položku'; END IF;
    RETURN NEW;
  END IF;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "OperationalProtocolItem_immutable" BEFORE INSERT OR UPDATE OR DELETE ON "OperationalProtocolItem"
FOR EACH ROW EXECUTE FUNCTION protect_issued_operational_item();

CREATE FUNCTION protect_repair_event() RETURNS trigger AS $$
BEGIN RAISE EXCEPTION 'Historii servisního případu nelze přepsat ani smazat'; END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "RepairEvent_immutable" BEFORE UPDATE OR DELETE ON "RepairEvent" FOR EACH ROW EXECUTE FUNCTION protect_repair_event();

CREATE FUNCTION protect_document_attachment() RETURNS trigger AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM "OperationalProtocol" WHERE "status" <> 'DRAFT'
    AND "snapshot"->'attachments' @> jsonb_build_array(jsonb_build_object('id', OLD."id"))) THEN
    RAISE EXCEPTION 'Příloha vystaveného dokumentu je neměnná';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "Attachment_issued_snapshot_guard" BEFORE UPDATE OR DELETE ON "Attachment" FOR EACH ROW EXECUTE FUNCTION protect_document_attachment();
