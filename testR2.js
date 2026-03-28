import dotenv from "dotenv";
dotenv.config();
import { searchChurchOnGoogle } from "./services/googlePlacesService.js";

async function test() {
    console.log("Testing searchChurchOnGoogle...");
    const res = await searchChurchOnGoogle("Catedral Metropolitana", "Ciudad de Mexico");
    console.log("Result:", res);
}

test();
