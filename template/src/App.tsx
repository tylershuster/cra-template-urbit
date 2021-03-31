import React, { ReactElement, useState } from 'react';
import _ from 'lodash';

import Urbit, { UrbitInterface } from '@urbit/http-api';
import { addPost, createPost, dateToDa, GraphNode, Resource, TextContent } from '@urbit/api';

import './App.css';
import useStore from './store';
import subscription, { handleEvent } from './subscription';
import logo from './logo.svg';

// Memoize the api without parameters
// so it returns the same authenticated, subscribed instance every time
const createApi = _.memoize(
  (): UrbitInterface => {
    const urb = new Urbit('http://localhost:8080', 'lidlut-tabwed-pillex-ridrup');
    urb.ship = 'zod';
    urb.onError = message => console.log(message); // Just log errors if we get any
    urb.subscribe(subscription); // You can call urb.subscribe(...) as many times as you want to different subscriptions
    urb.connect();
    return urb;
  }
);

interface MessageProps {
  path: string;
  node: GraphNode;
}

const Message = ({ path, node }: MessageProps): ReactElement | null => {
  // We sanitized the nodes to only include TextContent so we can cast it safely
  const contents: TextContent = (node.post.contents[0] as TextContent);

  const replier = () => {
    const urb = createApi();
    if (!urb.ship) {
      return;
    }
    // Get the resource that this message came from and write a reply.
    const [ship, name] = path.split('/');
    const message: TextContent = { text: `${node.post.author} said '${contents.text}'` };
    const post = createPost(urb.ship, [message]);
    // We don't need to wait for this thread to finish, because the nodes will come back
    // via the EventSource.
    urb.thread(addPost(`~${ship}`, name, post));
  };

  return (
    <tr onClick={replier} className='message'>
      <td className='meta'>{node.post.author}</td>
      <td className='meta'>{dateToDa(new Date(node.post['time-sent']))}</td>
      <td className='meta'>{path.split('/').slice(0, 2).join('/')}</td>
      <td>{contents.text}</td>
    </tr>
  );
};

const App = (): ReactElement => {
  // Hook into our store's state
  const nodes = useStore(state => state.nodes);

  // By default, we aren't connected. We need to verify
  const [connected, setConnected] = useState<boolean>(false);

  // Get the api, causing it to initialize
  const api = createApi();

  // If unconnected, check if we can access resources
  if (!connected) {
    (async () => {
      const graphKeys = await api.scry({ app: 'graph-store', path: '/keys' });
      // If graphKeys unavailable, the scry failed and the onError handler takes it from here.
      if (!graphKeys) {
        return;
      }
      // Otherwise, we are in business.
      setConnected(true);

      // Get all the latest 100 messages on every graph
      const keys = (graphKeys['graph-update'].keys as Array<Resource>);
      keys.forEach(async (key) => {
        const nodes = await api.scry({
          app: 'graph-store',
          path: `/newest/~${key.ship}/${key.name}/100`
        });
        // Scrying for nodes returns an event of the same shape
        // as if the nodes were freshly added, so we can pass this
        // result to the event handler from our subscription.
        handleEvent(nodes);
      });
    })();
  }

  // We had previously stubbed the error handler.
  // Now we replace it with one that can access the app's state.
  api.onError = (message: Error) => {
    setConnected(false);
    if (message.message === 'NetworkError when attempting to fetch resource.') {
      console.log(`Host unavailable. You may need to run |cors-approve ${window.location.origin}.`);
    }
  };

  if (!connected) {
    return <div className='App'>Unconnected</div>;
  }

  return (
    <div className='App'>
      <img src={logo} className="App-logo" alt="logo" />
      <h1>Messages</h1>
      <table>
        <thead><tr><th>Author</th><th>Date</th><th>Channel</th><th>Contents</th></tr></thead>
        {Object.keys(nodes).map(key => <Message key={key} path={key} node={nodes[key]} />)}
      </table>
    </div>
  );
};

export default App;
