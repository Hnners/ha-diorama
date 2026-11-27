<img src="docs/images/icon.svg" width="128" alt="A lit opal globe table lamp in a wooden cradle, the S.I.M.S. icon">

# S.I.M.S. (Smart-home In Miniature Scale)

A Home Assistant app that turns your home into a small 3D model you can click, with its own page in the sidebar.

This is a fork of [Diorama](https://github.com/CarlesRojas/ha-diorama) by Carles Rojas, with extra features on top. It goes by its own name so it is easy to tell apart from the original, and it runs as an app laid out and styled like the M.A.S.H. app: a header with tabs, charcoal panels, Barlow Condensed capitals for headings and buttons, and a plumbob green accent.

## The diorama

Draw your rooms, furnish them and bind the pieces to your Home Assistant devices. The model shows what your home is doing right now: a lamp glows when its light is on, and a click on it turns it off. Lamps light their room and cast shadows, and the sun moves through the day.

![Flying into the kitchen to turn on a lamp, walking to the living room to switch on the TV from the side panel, then adding a ceiling fan to the bedroom in the editor, binding it to a device, then turning it on from the card and lowering the projector screen](docs/images/demo.gif)

A sharper version of the clip is in [docs/video/demo.mp4](docs/video/demo.mp4).

## Widgets

The card comes with its own widgets in the same look as the model. Turn on **Show widgets beside the 3D view** and they appear next to it, one for each device you placed, grouped by room. You can also use them on their own, anywhere on a dashboard.

![A thermostat dial dragged down, a brightness slider, a front door opened with two taps, an all lights group and a robot vacuum started from its own button](docs/images/widgets.gif)

## The editor

Everything is built inside Home Assistant, in the card's own full-screen editor. The plan sits on top, a live 3D preview below and the catalog on the right. Draw rooms, drop pieces in, drag them, snap them to walls, tweak their style and colors, and pick the entity each one stands for.

![The editor with the sofa selected](docs/images/editor.png)

## Install

1. In Home Assistant go to **Settings → Apps → App store**, open the **⋮** menu and choose **Repositories**.
2. Add `https://github.com/Hnners/ha-diorama` and close the dialog.
3. Find **S.I.M.S.** in the store, install it, turn on **Show in sidebar**, and start it.

The first time it opens, S.I.M.S. brings over the house from a S.I.M.S. (Diorama) card on any of your dashboards, if there is one. After that the house is kept in the app itself, so it is part of Home Assistant's backups, and the dashboard card is no longer needed.

The app has three parts:

- **House**: the 3D model with its widgets beside it. Tap a device to see it and control it.
- **Edit house**: the full-screen editor, to draw rooms, furnish them and place devices.
- **Settings**: everything else, like the sun, the floors and which widgets show.

Updates come through **Settings → Updates** like any other app.

### Building the app

The app's page is built from this repo with `pnpm build:app`, into `sims/app/www`. The release workflow does this, sets the app's version and commits the result, so Home Assistant offers the update. To work on it with a real Home Assistant:

```bash
pnpm build:app
cd sims
pip install -r requirements.txt
HA_URL=http://homeassistant.local:8123 HA_TOKEN=<long-lived token> SIMS_DATA=./data uvicorn app.main:app --port 8099
```

## Start building

New to the card? This five minute tutorial builds a small home from an empty card: two rooms, a lamp and a fan bound to real devices, a camera view for each room and the side panel.

[![The tutorial in four steps: trace a room, furnish it, bind your devices and use it on a dashboard](docs/images/tutorial-steps.jpg)](https://cdn.jsdelivr.net/gh/CarlesRojas/ha-diorama@main/docs/tutorial/tutorial.mp4)

[Watch the tutorial video](https://cdn.jsdelivr.net/gh/CarlesRojas/ha-diorama@main/docs/tutorial/tutorial.mp4)

Or, in short:

1. Add the card to a dashboard and press **Open editor**.
2. Trace your first room on the grid.
3. Open the catalog and drop in a ceiling light and a sofa.
4. Select the light and pick the Home Assistant entity it stands for.
5. Save, then click the light in the card. It lights up, and so does the real one.
