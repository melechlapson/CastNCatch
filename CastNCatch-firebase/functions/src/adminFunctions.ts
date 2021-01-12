import * as functions from "firebase-functions";
import * as admin from "firebase-admin";

export const ADMIN_getUserStats = functions.https.onRequest((req, res) => {
    return getUserStatsAsync().then((response:string) => {
        res.status(200).send(response);
    }, function(error:any) {
        console.error(error);
        res.status(500).send(error);
    });
});

export const getUserStatsAsync = async () : Promise<string> => {
    const ref = admin.database().ref('users');
    const users = await ref.once('value');

    let total:number = 0;
    let highest:number = 0;
    let highestUser:string = "";
    let usersWith10000Coins = 0;
    let usersWith50000Coins = 0;
    users.forEach((user:admin.database.DataSnapshot) => {
        if (user.exists()) {
            const coins:number = user.child('coins').val();
            if (coins > highest) {
                highest = coins;
                highestUser = user.key || "";
            }
            if (coins > 10000) {
                usersWith10000Coins++;
            }
            if (coins > 50000) {
                usersWith50000Coins++;
            }
            total += coins;
        }
    });

    const average = total / users.numChildren();
    return users.numChildren() + " Users." +
        "\nHighest coins: " + highestUser + " (" + highest + " coins)" +
        "\nAverage coins: " + average +
        "\nUsers with more than 10,000 coins: " + usersWith10000Coins +
        "\nUsers with more than 50,000 coins: " + usersWith50000Coins;
}