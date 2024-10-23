import { FitAddon } from '@xterm/addon-fit';
import { ImageAddon } from '@xterm/addon-image';
import { WebLinksAddon } from '@xterm/addon-web-links';
import { Terminal } from '@xterm/xterm';
import _ from 'lodash';

import { terminal as termElement } from './disconnect/elements';
import { configureTerm } from './term/configuration';
import { loadOptions } from './term/load';
import type { Options } from './term/options';
import type { Socket } from 'socket.io-client';
import { WebglAddon } from '@xterm/addon-webgl';

export class Term extends Terminal {
  socket: Socket;
  fitAddon: FitAddon;
  loadOptions: () => Options;

  constructor(socket: Socket) {
    super({
      allowProposedApi: true,
      fontFamily: 'CaskaydiaCove Nerd Font Light, monospace',
      lineHeight: 1.2,
      theme: {
        background: '#1f222d',
        foreground: '#cccccc',
        selectionBackground: '#313752',
        selectionForeground: '#ffffff',

        black: '#272a37',
        red: '#ff605c',
        green: '#5bf68e',
        yellow: '#f6f65e',
        blue: '#8dadfb',
        magenta: '#ff92d0',
        cyan: '#89eaff',
        white: '#bfbfbf',

        brightBlack: '#4e4e4e',
        brightRed: '#ff8075',
        brightGreen: '#67f5a1',
        brightYellow: '#f4f884',
        brightBlue: '#acbaf9',
        brightMagenta: '#ffa8d9',
        brightCyan: '#8eecfd',
        brightWhite: '#ffffff',

        cursor: '#c7c7c7',
        cursorAccent: '#fffeff',
      },
    });
    this.socket = socket;
    this.fitAddon = new FitAddon();

    const webgl = new WebglAddon();
    webgl.onContextLoss((_e) => {
      webgl.dispose();
    });
    this.loadAddon(webgl);

    this.loadAddon(new WebLinksAddon());
    this.loadAddon(new ImageAddon());
    this.loadAddon(this.fitAddon);

    this.loadOptions = loadOptions;
  }

  resizeTerm(): void {
    this.refresh(0, this.rows - 1);
    if (this.shouldFitTerm) {
      this.fitAddon.fit();
    }
    this.socket.emit('resize', { cols: this.cols, rows: this.rows });
  }

  get shouldFitTerm(): boolean {
    return this.loadOptions().wettyFitTerminal ?? true;
  }
}

declare global {
  interface Window {
    wetty_term?: Term;
    wetty_close_config?: () => void;
    wetty_save_config?: (newConfig: Options) => void;
    clipboardData: DataTransfer;
    loadOptions: (conf: Options) => void;
  }
}

export function terminal(socket: Socket): Term | undefined {
  const term = new Term(socket);
  if (_.isNull(termElement)) {
    return undefined;
  }
  termElement.innerHTML = '';
  term.open(termElement);
  configureTerm(term);
  window.onresize = function onResize() {
    term.resizeTerm();
  };
  window.wetty_term = term;
  return term;
}
