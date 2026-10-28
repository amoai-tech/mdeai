import { describe, expect, it } from 'vitest';
import { hasCompleteRestaurantBookingDetails, shouldContinueVenueBookingAfterSearch as continueAfterSearch } from '../booking-continuation';
const id = 'a1b2c3d4-e5f6-4789-abcd-100000000005';
const ask = 'Find Verdeo restaurant in El Poblado. Prepare a table request for two on November 15 2026 at 7 PM Medellin. Contact name Maria, email maria@example.com. Show review before sending.';
const user = [{role:'user',content:{parts:[{type:'text',text:ask}]}}];
const grounded = {source:'supabase',results:[{id,name:'Verdeo',placeId:null}]};
const search = [{toolResults:[{toolName:'searchRestaurantsTool',output:grounded}]}];
describe('SAN-1149 same-turn booking continuation', () => {
  it('forces review proposal after grounded search with every required user slot', () => {
    expect(hasCompleteRestaurantBookingDetails(ask)).toBe(true);
    expect(continueAfterSearch({stepNumber:1,messages:user,steps:search})).toBe(true);
  });
  it('unwraps the real Mastra v6 JSON tool-result envelope', () => {
    expect(continueAfterSearch({stepNumber:1,messages:user,steps:[{toolResults:[{
      toolName:'searchRestaurantsTool',output:{type:'json',value:grounded},
    }]}]})).toBe(true);
  });
  it('does not require optional phone or notes', () => {
    expect(continueAfterSearch({stepNumber:1,messages:user,steps:search})).toBe(true);
  });
  it.each([
    ask.replace('for two','for guests'),
    ask.replace('November 15 2026','some day'),
    ask.replace('7 PM','later'),
    ask.replace('Contact name Maria','Please call me'),
    ask.replace('maria@example.com',''),
    ask.replace('table request','restaurant suggestions'),
  ])('does not force an incomplete booking: %s', text => {
    expect(continueAfterSearch({stepNumber:1,messages:[{role:'user',content:text}],steps:search})).toBe(false);
  });
  it('does not invent a match for the wrong restaurant, failed query, or invented ID', () => {
    for (const output of [
      {source:'supabase',results:[{id,name:'Different Place'}]},
      {source:'unavailable',results:[{id,name:'Verdeo'}]},
      {source:'fallback',results:[{id,name:'Verdeo'}]},
      {source:'supabase',results:[{id:'fake',name:'Verdeo'}]},
    ]) expect(continueAfterSearch({stepNumber:1,messages:user,steps:[{toolResults:[{toolName:'search-restaurants',output}]}]})).toBe(false);
  });
  it('never forces before search, after a prior proposal, or for a historic search', () => {
    expect(continueAfterSearch({stepNumber:0,messages:user,steps:search})).toBe(false);
    expect(continueAfterSearch({stepNumber:2,messages:user,steps:[...search,{toolCalls:[{toolName:'requestVenueBooking'}]}]})).toBe(false);
    expect(continueAfterSearch({stepNumber:1,messages:[{role:'user',content:'Show me restaurants'}],steps:search})).toBe(false);
    expect(continueAfterSearch({stepNumber:2,messages:user,steps:[{toolResults:[{toolName:'search-events',output:grounded}]}]})).toBe(false);
  });
  it('requires a grounded named restaurant in exactly the current text', () => {
    expect(continueAfterSearch({stepNumber:1,messages:[{role:'user',content:ask.replace('Verdeo','Verdant')}],steps:search})).toBe(false);
  });
});
