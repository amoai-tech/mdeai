import { expect, test } from "@playwright/test";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import { createThrowawayIdentity, getSupabaseAdmin, signInAs, type ThrowawayIdentity } from "./helpers/auth";

// Opt-in only. This test intentionally writes to a LOCAL Supabase instance.
const LOCAL = process.env.NEXT_PUBLIC_SUPABASE_URL?.startsWith("http://127.0.0.1:") ?? false;
test.skip(!LOCAL || process.env.MDE_LOCAL_ADMIN_QA !== "1",
  "Requires local Supabase plus MDE_LOCAL_ADMIN_QA=1");

test("admin publishes and edits a foreign event with durable audits; outsider denied", async ({ page, browser }) => {
  const admin = await getSupabaseAdmin();
  const people: ThrowawayIdentity[] = [];
  let eventId: string | null = null;
  const label = `PR552 QA ${randomUUID().slice(0, 7)}`;
  const write = (error: { message: string } | null, action: string) => expect(error, `${action}: ${error?.message}`).toBeNull();
  fs.mkdirSync("tmp/qa/pr552-local", { recursive: true });
  try {
    const host = await createThrowawayIdentity("pr552-owner"); people.push(host);
    const operator = await createThrowawayIdentity("pr552-admin"); people.push(operator);
    const outsider = await createThrowawayIdentity("pr552-outsider"); people.push(outsider);
    write((await admin.from("user_roles").insert({ user_id: operator.userId, role: "super_admin" })).error, "grant admin");
    const added = await admin.from("events").insert({
      name: label, source: "manual", event_start_time: "2027-05-05T21:00:00Z",
      event_end_time: "2027-05-05T23:00:00Z", organizer_id: host.userId,
      city: "Medellín", status: "draft", is_active: true,
    }).select("id").single();
    write(added.error, "insert event"); eventId = added.data!.id;
    write((await admin.from("event_tickets").insert({event_id:eventId,name:"QA only",price_cents:1500,qty_total:8})).error,"insert tier");

    await signInAs(page, operator.email);
    await page.goto("http://localhost:3071/app/admin/events?inactive=1");
    const row = page.locator("tr").filter({ hasText: label });
    await expect(row).toHaveCount(1, { timeout: 35000 });
    await page.screenshot({path:"tmp/qa/pr552-local/admin-events-desktop.png",fullPage:true});
    await row.getByTestId("admin-event-publish").click();
    await expect(row.getByText("Saved: published")).toBeVisible({ timeout: 25000 });
    const saved = await admin.from("events").select("status").eq("id",eventId).single();
    write(saved.error,"verify published"); expect(saved.data!.status).toBe("published");
    const audit1 = await admin.from("admin_event_state_audit").select("actor_id,action,before_status,after_status").eq("event_id",eventId);
    write(audit1.error,"verify publish audit");
    expect(audit1.data).toEqual([expect.objectContaining({actor_id:operator.userId,action:"publish",before_status:"draft",after_status:"published"})]);

    await page.goto(`http://localhost:3071/app/events/${eventId}`);
    await expect(page.getByTestId("host-event-edit-form")).toBeVisible({timeout:35000});
    await expect(page.getByText("QA only")).toBeVisible();
    await page.locator('input[name="name"]').fill(label+" edited");
    await page.getByTestId("host-event-save").click();
    await expect(page.getByText("Saved. Refreshing keeps these values.")).toBeVisible({timeout:30000});
    const audit2=await admin.from("admin_event_state_audit").select("actor_id,action,after_fields").eq("event_id",eventId);
    write(audit2.error,"verify edit audit");
    expect(audit2.data).toHaveLength(2);
    expect(audit2.data?.some(r=>r.action==="edit"&&r.actor_id===operator.userId&&r.after_fields?.name===label+" edited")).toBe(true);
    await page.screenshot({path:"tmp/qa/pr552-local/admin-edited-desktop.png",fullPage:true});

    const deniedContext=await browser.newContext({viewport:{width:390,height:844}});
    try {
      const denied=await deniedContext.newPage();await signInAs(denied,outsider.email);
      await denied.goto("http://localhost:3071/app/admin/events");
      await expect(denied.getByTestId("admin-events-denied")).toBeVisible({timeout:30000});
      await denied.goto(`http://localhost:3071/app/events/${eventId}`);
      await expect(denied.getByTestId("host-event-edit-form")).toHaveCount(0);
      await denied.screenshot({path:"tmp/qa/pr552-local/outsider-denied-390.png",fullPage:true});
    } finally {await deniedContext.close();}
    const mobile=await browser.newContext({viewport:{width:390,height:844}});
    try {
      const view=await mobile.newPage();await signInAs(view,operator.email);
      await view.goto("http://localhost:3071/app/admin/events?inactive=1");
      await expect(view.getByTestId("admin-events-table")).toBeVisible({timeout:30000});
      await view.screenshot({path:"tmp/qa/pr552-local/admin-events-390.png",fullPage:true});
    } finally {await mobile.close();}
  } finally {
    const cleanupErrors: string[]=[];
    const del=async (table:string,field:string,value:string)=>{
      const {error}=await admin.from(table).delete().eq(field,value);if(error)cleanupErrors.push(`${table}: ${error.message}`);
    };
    if(eventId){await del("admin_event_state_audit","event_id",eventId);await del("event_tickets","event_id",eventId);await del("events","id",eventId);}
    for(const identity of people){await del("user_roles","user_id",identity.userId); const result=await admin.auth.admin.deleteUser(identity.userId);if(result.error)cleanupErrors.push(result.error.message);await del("profiles","id",identity.userId);}
    if(eventId){for(const table of ["admin_event_state_audit","event_tickets","events"]){
      const key=table==="events"?"id":"event_id";
      const {count,error}=await admin.from(table).select("id",{count:"exact",head:true}).eq(key,eventId);
      if(error||count!==0)cleanupErrors.push(`${table}: remaining ${count??"unknown"}, ${error?.message??""}`);
    }}
    expect(cleanupErrors,"QA cleanup").toEqual([]);
  }
});
