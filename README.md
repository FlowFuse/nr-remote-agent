# FlowFuse Node-RED Remote Agent

A [Node-RED](https://nodered.org) plugin that connects an existing, self-managed Node-RED
instance to the [FlowFuse](https://flowfuse.com) platform as a Remote Instance.

Unlike the [FlowFuse Device Agent](https://github.com/FlowFuse/device-agent), this plugin runs
*inside* your own Node-RED. You continue to install, run and update Node-RED however you like -
the plugin adds a connection to FlowFuse so the instance can be seen and managed alongside the
rest of your team's instances.

## Documentation

 - [FlowFuse Remote Agent Plugin documentation](https://flowfuse.com/docs/device-agent/plugin/overview/)

## Requirements

- Node-RED 4.1 or later
- Node.js 22 or later
- A FlowFuse account - either [FlowFuse Cloud](https://app.flowfuse.com) or a self-hosted
  installation (FlowFuse 3.1 or later)

## Installation

Install the plugin into your Node-RED instance using the Palette Manager, or from the command
line in your Node-RED user directory (typically `~/.node-red`):

```bash
npm install @flowfuse/nr-remote-agent
```

Restart Node-RED to load the plugin.

## Connecting to FlowFuse

In the status bar of the Node-RED editor you will see a 'Connect to FlowFuse' button.

1. Open the Node-RED editor and click on the 'Connect to FlowFuse' button in the status bar. This will open the **settings** dialog for the remote agent.
3. Enter the URL of your FlowFuse platform. This defaults to `https://app.flowfuse.com` for
   FlowFuse Cloud - change it if you are using a self-hosted installation.
4. Click **Connect**. A FlowFuse window opens for you to log in and choose the team and
   application the instance should be added to.
5. Once you complete the steps in FlowFuse, the settings pane will refresh to show the instance details, and the status bar button will show the state of the connection.


### Disconnecting

The same settings pane provides a **Disconnect** option. Disconnecting removes the local
connection details - the instance cannot be reconnected to the same FlowFuse entry and will need
to be registered again as a new Remote Instance.

## What the plugin lets you do

Once connected, the instance appears in your FlowFuse team and you can:

- View the instance's logs remotely
- Automatically capture a snapshots of your flows whenever you deploy changes
- See a record of audit events from the instance in the FlowFuse audit log


## Comparison with the Device Agent

The [FlowFuse Device Agent](https://github.com/FlowFuse/device-agent) and this plugin both
connect Node-RED to FlowFuse, but they take opposite approaches to who owns the runtime.

The Device Agent provides a fully managed Node-RED environment; where you can deploy flows remotely,
securely access the editor from anywhere and manage the Node-RED version and updates.

This plugin doesn't provide all of these features yet, but we will be continuing to iterate to
add more capabilities.

Some features of the Device Agent will not be reproducable with the plugin due to the way it runs
inside of Node-RED, rather than around the outside.

## Contributing

Issues and pull requests are welcome on
[GitHub](https://github.com/FlowFuse/nr-remote-agent).

To work on the plugin locally:

```bash
npm install
npm run build        # build the plugin into dist/
npm run watch        # rebuild on change
npm run lint         # check code style
```


## Support

- [FlowFuse community forum](https://discourse.nodered.org/c/flowfuse/)
- [Report an issue](https://github.com/FlowFuse/nr-remote-agent/issues)

## License

Apache-2.0 - see [LICENSE](LICENSE).
