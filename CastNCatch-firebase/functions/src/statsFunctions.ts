import * as functions from "firebase-functions";
import * as admin from "firebase-admin";

interface CaughtFish {
    name:string,
    ounces:number
}

interface FishStats {
    totalCaught:number,
    totalOunces:number
}

/**
 * Submits stats for a fishing session (e.g. catches)
 */
export const submitRoundStats = functions.https.onCall((data, context) => {
    if (!context.auth) return { error: "Unauthorized." }; //no user ID or not authenticated

    const userID:string = context.auth.uid;

    //parse fish caught (if any) to array
    let fishCaught:Array<CaughtFish>;
    if (data.fishCaught) fishCaught = JSON.parse(data.fishCaught);
    else fishCaught = new Array<CaughtFish>();

    const casts:number = parseInt(data.totalCasts);

    return saveStatsAsync(userID, casts, fishCaught).then((response) => {
        return JSON.stringify(response);
    }, function(error) {
        console.error(error);
        return { error: "A server error occurred."};
    });
});

export const saveStatsAsync = async (userID:string, casts:number, fishCaught:Array<CaughtFish>) : Promise<any> => {

    const ref = admin.database().ref('userStats').child(userID);
    const userStats = await ref.once('value');

    let biggestCatch:CaughtFish = {
        name: "",
        ounces: 0
    };
    const catchesByFish:Map<string, FishStats> = new Map<string, FishStats>();
    let totalCasts:number = casts;
    let totalCatches:number = 0;
    let totalOunces:number = 0;

    //read existing data from DB
    if (userStats.exists()) {
        const prevCasts:number = parseInt(userStats.child("totalCasts").val());
        totalCasts = totalCasts + prevCasts;
        totalCatches = parseInt(userStats.child("totalCatches").val());
        totalOunces = parseInt(userStats.child("totalOunces").val());

        if (userStats.child("biggestCatch").exists()) {
            biggestCatch = userStats.child("biggestCatch").val();
        }

        //read catchesByFish from DB
        //TODO: is there a way to optimize this?
        if (userStats.child("catchesByFish").exists()) {
            userStats.child("catchesByFish").forEach(child => {
                if (child.key) catchesByFish.set(child.key, child.val());
            });
        }
    }

    //loop through the fish we just caught and update our stats
    fishCaught.forEach(element => {
        totalCatches++;
        totalOunces += element.ounces;
        if (element.ounces > biggestCatch.ounces) {
            biggestCatch = element;
        }

        const existingStats = catchesByFish.get(element.name);
        //if we already have a record for this fish type, add to it
        if (existingStats) {
            existingStats.totalCaught++;
            existingStats.totalOunces += element.ounces;
            catchesByFish.set(element.name, existingStats);
        } else { //otherwise, create a new record for this fish type
            catchesByFish.set(element.name, {
                totalCaught: 1,
                totalOunces: element.ounces
            })
        }
    });

    //save to DB
    const entry = {
        biggestCatch: biggestCatch,
        totalCasts: totalCasts,
        totalCatches: totalCatches,
        totalOunces: totalOunces
    }
    if (userStats.exists()) {
        await ref.update(entry);
    } else {
        await ref.set(entry);
    }

    //convert catchesByFish to key-value object
    const cbf : {[index: string]:FishStats} = Array.from(catchesByFish).reduce((obj:{[index: string]:FishStats}, [key, value]) => {
        obj["catchesByFish/" + key] = value;
        return obj;
    }, {});
    await ref.update(cbf);

    return { result: "Success" };
};