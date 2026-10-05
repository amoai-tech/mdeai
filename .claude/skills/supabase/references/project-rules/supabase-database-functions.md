---
paths:
  - "supabase/**/*.sql"
---

# Database: Create functions

You're a Supabase Postgres expert in writing database functions. Generate **high-quality PostgreSQL functions** that adhere to the following best practices:

## General Guidelines

1. **Default to `SECURITY INVOKER`:**
   - Functions should run with the permissions of the user invoking the function, ensuring safer access control.
   - Use `SECURITY DEFINER` only when explicitly required and explain the rationale.

2. **Set the `search_path` Configuration Parameter:**
   - Always set `search_path` to an empty string (`set search_path = '';`).
   - This avoids unexpected behavior and security risks caused by resolving object references in untrusted or unintended schemas.
   - Use fully qualified names (e.g., `schema_name.table_name`) for all database objects referenced within the function.

3. **Adhere to SQL Standards and Validation:**
   - Ensure all queries within the function are valid PostgreSQL SQL queries and compatible with the specified context (ie. Supabase).

4. **Classify execution privileges explicitly:**
   - Classify every new or changed RPC/function by intended caller: `anon`, `authenticated`, internal/service, or no external caller.
   - PostgreSQL functions are executable by `PUBLIC` by default. Sensitive RPCs must explicitly remove unnecessary `EXECUTE` privileges and grant only the roles that need them.
   - Use the exact function signature when changing privileges for an overloaded function.
   - Test a direct RPC invocation as every relevant role. Proving only that the UI or API wrapper hides a function is not authorization.
   - Do not blanket-revoke existing RPCs without first classifying each signature.

For example, an internal admin RPC can begin with:

```sql
revoke execute on function public.some_admin_action(uuid) from public, anon, authenticated;
```

Add a narrow `grant execute` only when the classified caller actually needs direct access.

## Best Practices

1. **Minimize Side Effects:**
   - Prefer functions that return results over those that modify data unless they serve a specific purpose (e.g., triggers).

2. **Use Explicit Typing:**
   - Clearly specify input and output types, avoiding ambiguous or loosely typed parameters.

3. **Declare volatility from proven behavior:**
   - Leave PostgreSQL's `VOLATILE` default unless stricter semantics are proven.
   - Use `STABLE` only for read-only behavior that is consistent within a statement.
   - Use `IMMUTABLE` only when the result depends solely on its arguments and other immutable inputs. Do not use it for functions that depend on tables, auth/session state, configuration, time, or other mutable state.
   - Never mark a function `STABLE` or `IMMUTABLE` merely for performance; the volatility category is a promise to PostgreSQL's optimizer.

4. **Triggers (if Applicable):**
   - If the function is used as a trigger, include a valid `CREATE TRIGGER` statement that attaches the function to the desired table and event (e.g., `BEFORE INSERT`).

## Example Templates

### Simple Function with `SECURITY INVOKER`

```sql
create or replace function my_schema.hello_world()
returns text
language plpgsql
security invoker
set search_path = ''
as $$
begin
  return 'hello world';
end;
$$;
```

### Function with Parameters and Fully Qualified Object Names

```sql
create or replace function public.calculate_total_price(order_id bigint)
returns numeric
language plpgsql
security invoker
set search_path = ''
as $$
declare
  total numeric;
begin
  select sum(price * quantity)
  into total
  from public.order_items
  where order_id = calculate_total_price.order_id;

  return total;
end;
$$;
```

### Function as a Trigger

```sql
create or replace function my_schema.update_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  -- Update the "updated_at" column on row modification
  new.updated_at := now();
  return new;
end;
$$;

create trigger update_updated_at_trigger
before update on my_schema.my_table
for each row
execute function my_schema.update_updated_at();
```

### Function with Error Handling

```sql
create or replace function my_schema.safe_divide(numerator numeric, denominator numeric)
returns numeric
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if denominator = 0 then
    raise exception 'Division by zero is not allowed';
  end if;

  return numerator / denominator;
end;
$$;
```

### Immutable Function for Proven Immutable Behavior

```sql
create or replace function my_schema.full_name(first_name text, last_name text)
returns text
language sql
security invoker
set search_path = ''
immutable
as $$
  select first_name || ' ' || last_name;
$$;
```
