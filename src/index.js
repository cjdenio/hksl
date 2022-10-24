import { config } from "dotenv";
config();

import _bolt from "@slack/bolt";
import axios from "axios";
import { PrismaClient } from "@prisma/client";

const { App } = _bolt;

const itemEmojis = {
  bbc_seed: "bractus_seed",
  bbc_essence: "bread_essence",
  bbc_compressence: "bressence",

  hvv_seed: "hacker_vibes_vine_seed",
  hvv_essence: "hacker_spirit",
  hvv_compressence: "hacksprit",

  cyl_seed: "coffea_cyl_seed",
  cyl_essence: "cyl_crystal",
  cyl_compressence: "crystcyl",

  nest_egg: "nest_egg",
};

const plantImages = {
  dirt: "https://github.com/hackagotchi/hackagotchi/blob/master/img/icon/dirt.png?raw=true",
  bbc: "https://github.com/hackagotchi/hackagotchi/blob/master/img/plant/bractus_loaf.gif?raw=true",
  hvv: "https://github.com/hackagotchi/hackagotchi/blob/master/img/plant/hacker_vibes_vine_baby.gif?raw=true",
  cyl: "https://github.com/hackagotchi/hackagotchi/blob/master/img/plant/coffea_cyl_baby.gif?raw=true",
};

function inventoryToItemList(inventory) {
  const items = [];

  for (const item in inventory) {
    if (Object.hasOwnProperty.call(inventory, item)) {
      const count = inventory[item];

      for (let i = 0; i < count; i++) {
        items.push(item);
      }
    }
  }

  return items;
}

function canCraft(inventory, recipe) {
  for (const [item, countNeeded] of Object.entries(recipe.needs)) {
    if ((inventory[item] || 0) < countNeeded) {
      return false;
    }
  }

  return true;
}

let manifest;
let userActivity = {};

const prisma = new PrismaClient();
const app = new App({
  token: process.env.SLACK_TOKEN,
  signingSecret: process.env.SLACK_SIGNING_SECRET,
});

setInterval(() => {
  try {
    const activeUsers = Object.entries(userActivity)
      .filter(([, lastActive]) => lastActive < Date.now() + 1000 * 60 * 5)
      .map(([user]) => user);

    activeUsers.forEach(async (user) => {
      if (await prisma.user.findUnique({ where: { slackId: user } })) {
        await updateAppHome(user);
      }
    });
  } catch (e) {
    console.error(e);
  }
}, 5000);

async function updateAppHome(userId) {
  const user = await prisma.user.findUnique({ where: { slackId: userId } });

  if (!user) {
    return await app.client.views.publish({
      user_id: userId,
      view: {
        type: "home",
        blocks: [
          {
            type: "section",
            text: {
              type: "mrkdwn",
              text: "Welcome to hksl, the Slack client for hkgi.",
            },
          },

          {
            type: "actions",
            elements: [
              {
                type: "button",
                action_id: "auth",
                text: {
                  type: "plain_text",
                  text: "Sign in or sign up",
                },
              },
            ],
          },
        ],
      },
    });
  }

  const { data: stead } = await axios(
    "https://misguided.enterprises/hkgi/getstead",
    { auth: { username: user.username, password: user.password } }
  );

  await app.client.views.publish({
    user_id: userId,
    view: {
      type: "home",
      blocks: [
        {
          type: "header",
          text: {
            type: "plain_text",
            text: "Your stead",
          },
        },
        ...stead.plants.flatMap((plant, plotIndex) => {
          const ttYield = Math.ceil(plant.tt_yield / 1000);

          return [
            {
              type: "section",
              text: {
                type: "mrkdwn",
                text: `*${manifest.plant_titles[plant.kind]}* \`${
                  plant.kind
                }\`${plant.kind == "dirt" ? "\n\n_So much opportunity!_" : ""}`,
              },
              fields: plant.tt_yield
                ? [
                    {
                      type: "mrkdwn",
                      // text: `*:clock${
                      //   (ttYield % 13) + Math.floor(ttYield / 13)
                      // }: Next yield*\n${ttYield} seconds`,
                      text: `*:clock2: Next yield*\n${ttYield} seconds`,
                    },
                  ]
                : undefined,
              accessory: plantImages[plant.kind]
                ? {
                    type: "image",
                    image_url: plantImages[plant.kind],
                    alt_text: manifest.plant_titles[plant.kind],
                  }
                : undefined,
            },
            ...(manifest.plant_recipes[plant.kind] || []).flatMap(
              (recipe, recipeIndex) => {
                const canCraftItem = canCraft(stead.inv, recipe);

                // Hide plant recipes if they're uncraftable
                if (!canCraftItem && recipe.change_plant_to) {
                  return [];
                }

                return [
                  {
                    type: "section",
                    text: {
                      type: "mrkdwn",
                      text:
                        Object.entries(recipe.needs)
                          .map(
                            ([item, count]) =>
                              `${count} :${itemEmojis[item]}: ${manifest.items[item].name}`
                          )
                          .join(", ") +
                        " :arrow_right: *" +
                        (recipe.make_item
                          ? manifest.items[recipe.make_item].name
                          : `:seedling: ` +
                            manifest.plant_titles[recipe.change_plant_to]) +
                        "*",
                    },
                    accessory: {
                      type: "button",
                      text: {
                        type: "plain_text",
                        emoji: true,
                        text: recipe.change_plant_to
                          ? ":seedling: Plant"
                          : canCraftItem
                          ? ":hammer_and_pick: Craft"
                          : "Can't craft this",
                      },
                      action_id: "craft",
                      value: JSON.stringify({ plotIndex, recipeIndex }),
                      style:
                        recipe.change_plant_to ||
                        (!stead.plants.some((plant) => plant.kind == "dirt") &&
                          canCraftItem)
                          ? "primary"
                          : undefined,
                      // confirm: recipe.change_plant_to
                      //   ? {
                      //       title: {
                      //         type: "plain_text",
                      //         text: "Are you sure?",
                      //       },
                      //       text: {
                      //         type: "mrkdwn",
                      //         text: `This will replace the plant in this plot with a new one. Are you sure you want to do this?`,
                      //       },
                      //       confirm: {
                      //         type: "plain_text",
                      //         text: "Yes",
                      //       },
                      //       deny: {
                      //         type: "plain_text",
                      //         text: "No",
                      //       },
                      //     }
                      //   : undefined,
                    },
                  },
                ];
              }
            ),
            { type: "divider" },
          ];
        }),
        {
          type: "header",
          text: {
            type: "plain_text",
            text: "Inventory",
          },
        },
        ...Object.entries(stead.inv)
          .filter(([, count]) => count > 0)
          .map(([item, count]) => ({
            type: "section",
            text: {
              type: "mrkdwn",
              text: `:${itemEmojis[item]}: ${
                manifest.items[item].name
              } \`${item}\`${count > 1 ? ` *x${count}*` : ""}`,
            },
            accessory: manifest.items[item].usable
              ? {
                  type: "overflow",
                  action_id: "item_options",
                  options: [
                    {
                      text: {
                        type: "plain_text",
                        emoji: true,
                        text: item.includes("egg")
                          ? ":nest_egg: Hatch"
                          : ":sparkles: Use",
                      },
                      value: "use",
                    },
                    {
                      text: {
                        type: "plain_text",
                        emoji: true,
                        text: ":package: Send",
                      },
                      value: "send",
                    },
                  ],
                }
              : {
                  type: "button",
                  action_id: "send",
                  value: item,
                  text: {
                    type: "plain_text",
                    emoji: true,
                    text: ":package: Send",
                  },
                },
          })),
        {
          type: "context",
          elements: [
            {
              type: "mrkdwn",
              text: "hksl v0.1",
            },
          ],
        },
      ],
    },
  });
}

app.event("app_home_opened", async ({ event }) => {
  userActivity[event.user] = Date.now();
  await updateAppHome(event.user);
});

app.action("auth", async ({ ack, client, body }) => {
  await ack();

  await client.views.open({
    trigger_id: body.trigger_id,
    view: {
      type: "modal",
      title: {
        type: "plain_text",
        text: "Sign in or sign up",
      },
      callback_id: "auth",
      submit: {
        type: "plain_text",
        text: "Go!",
      },
      blocks: [
        {
          type: "input",
          block_id: "username",
          label: {
            type: "plain_text",
            text: "Username",
          },
          element: {
            type: "plain_text_input",
            action_id: "username",
            placeholder: {
              type: "plain_text",
              text: "cjdenio",
            },
          },
        },
        {
          type: "input",
          block_id: "password",
          label: {
            type: "plain_text",
            text: "Password",
          },
          element: {
            type: "plain_text_input",
            action_id: "password",
            placeholder: {
              type: "plain_text",
              text: "hunter2",
            },
          },
          hint: {
            type: "plain_text",
            text: "If you don't have an account, it'll be created with this password.",
          },
        },
      ],
    },
  });
});

app.view("auth", async ({ ack, view, body }) => {
  const username = view.state.values.username.username.value;
  const password = view.state.values.password.password.value;

  const { data } = await axios.post(
    "https://misguided.enterprises/hkgi/testauth",
    {},
    {
      auth: {
        username,
        password,
      },
    }
  );

  if (!data.ok) {
    if (data.msg == "user doesn't exist") {
      await ack({
        response_action: "errors",
        errors: {
          username: "that user doesn't exist",
        },
      });
    } else if (data.msg == "wrong password") {
      await ack({
        response_action: "errors",
        errors: {
          password: "incorrect password",
        },
      });
    } else {
      await ack({
        response_action: "errors",
        errors: {
          username: "something went wrong",
        },
      });
    }
  } else {
    await ack();
    await prisma.user.create({
      data: { slackId: body.user.id, username, password },
    });

    await updateAppHome(body.user.id);
  }
});

app.action("send", async ({ ack, action, body }) => {
  userActivity[body.user.id] = Date.now();
  await ack();

  console.log(`sending ${action.value}`);

  await updateAppHome(body.user.id);
});

app.action("item_options", async ({ ack, action, body }) => {
  userActivity[body.user.id] = Date.now();
  await ack();

  console.log(`item action: ${action.selected_option.value}`);

  await updateAppHome(body.user.id);
});

app.action("craft", async ({ ack, action, body }) => {
  await ack();

  const user = await prisma.user.findUniqueOrThrow({
    where: { slackId: body.user.id },
  });

  userActivity[body.user.id] = Date.now();

  const value = JSON.parse(action.value);

  const { data } = await axios.post(
    "https://misguided.enterprises/hkgi/craft",
    {
      plot_index: value.plotIndex,
      recipe_index: value.recipeIndex,
    },
    {
      auth: {
        username: user.username,
        password: user.password,
      },
    }
  );

  await updateAppHome(body.user.id);
});

(async () => {
  const { data: _manifest } = await axios(
    "https://misguided.enterprises/hkgi/manifest"
  );
  manifest = _manifest;

  await app.start(3000);
  console.log("hksl started");
})();
