// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { AdminRestaurantsTable, type AdminRestaurantRow } from "./admin-restaurants-table";
vi.mock("@/components/partners/restaurant/restaurant-admin-assignment",()=>({
  RestaurantAdminAssignment: () => <div data-testid="assignment-control">Reviewed transfer control</div>,
}));
const rows: AdminRestaurantRow[] = [
  {id:"one",name:"Verdeo",neighborhood:"El Poblado",city:"Medellín",address:null,source:"google",placeId:"place-one",partnerId:null,active:true,suggestedPartnerIds:["pa"]},
  {id:"two",name:"Café Norte",neighborhood:"Laureles",city:"Medellín",address:null,source:"manual",placeId:null,partnerId:"pa",active:true,suggestedPartnerIds:[]},
];
describe("SAN-1604 MDE Team restaurant overview",()=>{
  it("shows truthful MDE-managed status and suggestion without assigning",()=>{
    render(<AdminRestaurantsTable rows={rows} partners={[{id:"pa",name:"Verdeo Group"}]} canTransfer/>);
    expect(screen.getByText("MDE-managed · No partner assigned")).toBeTruthy();
    fireEvent.click(screen.getAllByRole("button",{name:"Manage"})[0]);
    expect(screen.getByText(/Possible Place ID match/)).toBeTruthy();
    expect(screen.getByTestId("assignment-control")).toBeTruthy();
  });
  it("filters by name or neighborhood and hides transfer controls for ordinary admin",()=>{
    render(<AdminRestaurantsTable rows={rows} partners={[]} canTransfer={false}/>);
    fireEvent.change(screen.getByRole("searchbox"),{target:{value:"Laureles"}});
    expect(screen.queryByText("Verdeo")).toBeNull();
    expect(screen.getByText("Café Norte")).toBeTruthy();
    fireEvent.click(screen.getByRole("button",{name:"Manage"}));
    expect(screen.queryByTestId("assignment-control")).toBeNull();
    expect(screen.getByText(/Only Super Admin can transfer/)).toBeTruthy();
  });
});
