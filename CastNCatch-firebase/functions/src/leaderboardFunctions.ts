import * as admin from "firebase-admin";

/**
 * Update the top 10 leaderboard
 * I am very sure there is a better way to do this but we ran out of time
 */
export const updateLeaderboard = async () : Promise<any> => {
    //query with top 10 players by ounces, query was in descending order order so start at 10th position
    
    const leaderboardref = await admin.database().ref('leaderboard');
    const userRef = await admin.database().ref('users');

    await admin.database().ref('userStats').orderByChild('totalOunces').limitToFirst(10).once("value", function(snapshot)
    {
        let place: number = 1;
        let position: string = "";
        snapshot.forEach(function (snapshot) {
            position = "pos" + place.toString();
            //sets posnum/playerName to displayName of associated uid
            leaderboardref.child(position).child('playerName').set(userRef.child(snapshot.val()).child('displayName').toString());
            //sets posnum/playerOunces to totalOunces of associated uid
            leaderboardref.child(position).child('playerOunces').set(snapshot.child('totalOunces'));

            place++;

        });
    });
}