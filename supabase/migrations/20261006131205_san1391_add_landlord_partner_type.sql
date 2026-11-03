-- SAN-1391: add the 'landlord' partner type for owner onboarding.
-- partner_drafts.type maps landlord_owner -> 'landlord' and broker_agent -> 'broker';
-- an owner is never labelled a broker. Do not use the new value inside this migration:
-- ALTER TYPE ... ADD VALUE cannot be referenced until the transaction commits.
alter type public.partner_type add value if not exists 'landlord';
