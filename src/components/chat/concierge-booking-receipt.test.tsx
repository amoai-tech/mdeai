// @vitest-environment jsdom
import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';

const mocks=vi.hoisted(()=>({
  persist:vi.fn(),
  record:vi.fn(),
  clear:vi.fn(),
}));
vi.mock('@copilotkit/react-core/v2',()=>({useHumanInTheLoop:vi.fn()}));
vi.mock('@/components/chat/rental-ui-context',()=>({useRentalUi:()=>({setVenueBookingConfirmation:mocks.record})}));
vi.mock('@/components/chat/venue-booking-direct-hitl-core',()=>({submitDirectVenueBooking:mocks.persist}));
vi.mock('@/components/chat/venue-booking-draft-store',()=>({clearVenueBookingReview:mocks.clear}));
vi.mock('@/components/chat/venue-booking-hitl-panel',()=>({VenueBookingHitlPanel:({respond}: {respond:(choice:'approved'|'rejected',args:object)=>Promise<void>})=>(
  <button onClick={()=>{void respond('approved',{
    venueKind:'restaurant',restaurantId:'a1b2c3d4-e5f6-4789-abcd-100000000005',
    requestedAt:'2026-11-16T00:00:00.000Z',partySize:2,contactName:'QA',contactEmail:'qa@example.com',venueTitle:'Verdeo'
  }).catch(()=>{})}}>Send request</button>
)}));
import {createVenueBookingHitlRender} from './concierge-copilot-bridge';
const args={venueKind:'restaurant' as const,restaurantId:'a1b2c3d4-e5f6-4789-abcd-100000000005',requestedAt:'2026-11-16T00:00:00.000Z',partySize:2,contactName:'QA',contactEmail:'qa@example.com',venueTitle:'Verdeo'};
const confirmation={requestId:'89b74e17-31d2-4e74-9a0c-be5d89644e11',message:'Request saved; pending, not confirmed',venueTitle:'Verdeo'};
const Render=createVenueBookingHitlRender();

describe('SAN-1149 live Mastra HITL receipt sync',()=>{
  beforeEach(()=>{vi.clearAllMocks()});
  afterEach(cleanup);
  it('publishes the persisted receipt directly after a successful customer Send, before the CopilotKit tool response',async()=>{
    mocks.persist.mockResolvedValue({ok:true,confirmation});
    const acknowledge=vi.fn(async()=>{});
    render(<Render args={args} status="executing" respond={acknowledge}/>);
    fireEvent.click(screen.getByText('Send request'));
    await waitFor(()=>expect(mocks.record).toHaveBeenCalledWith(confirmation));
    expect(mocks.persist).toHaveBeenCalledTimes(1);
    expect(mocks.record.mock.invocationCallOrder[0]).toBeLessThan(acknowledge.mock.invocationCallOrder[0]);
  });
  it('keeps the already saved receipt even if the agent acknowledgement fails',async()=>{
    mocks.persist.mockResolvedValue({ok:true,confirmation});
    const acknowledge=vi.fn(async()=>{throw new Error('Agent transport interrupted')});
    const warn=vi.spyOn(console,'warn').mockImplementation(()=>{});
    try {
      render(<Render args={args} status="executing" respond={acknowledge}/>);
      fireEvent.click(screen.getByText('Send request'));
      await waitFor(()=>expect(mocks.record).toHaveBeenCalledWith(confirmation));
      await waitFor(()=>expect(warn).toHaveBeenCalledTimes(1));
      expect(mocks.persist).toHaveBeenCalledTimes(1);
    } finally {warn.mockRestore()}
  });
  it('never displays a receipt for a failed persistence',async()=>{
    mocks.persist.mockResolvedValue({ok:false,error:new Error('Database unavailable')});
    render(<Render args={args} status="executing" respond={vi.fn()}/>);
    fireEvent.click(screen.getByText('Send request'));
    await waitFor(()=>expect(mocks.persist).toHaveBeenCalledTimes(1));
    expect(mocks.record).not.toHaveBeenCalled();
  });
});
