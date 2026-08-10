// Config temporal para correr tests en el worktree.
// El path del worktree tiene \.claude\ con backslash que rompe el glob de CRA.
// Usamos testRegex (regex puro, no glob) para evitar el problema.
// Usamos babel-preset-react-app para soportar toda la syntax del proyecto.
const path = require('path');

process.env.NODE_ENV = 'test';
process.env.BABEL_ENV = 'test';

module.exports = {
  rootDir: 'C:/Users/angel/Documents/Proyectos/gestion-grupo-mediterra/.claude/worktrees/optimistic-shannon-b560d8',
  roots: ['C:/Users/angel/Documents/Proyectos/gestion-grupo-mediterra/.claude/worktrees/optimistic-shannon-b560d8/src'],
  testRegex: '(/__tests__/.*|(\\.|/)(test|spec))\\.(jsx?|tsx?)$',
  testEnvironment: 'jsdom',
  transform: {
    '^.+\\.(js|jsx|ts|tsx)$': ['babel-jest', {
      presets: [
        path.join(
          'C:/Users/angel/Documents/Proyectos/gestion-grupo-mediterra/node_modules',
          'babel-preset-react-app'
        ),
      ],
    }],
  },
  transformIgnorePatterns: ['/node_modules/'],
  moduleFileExtensions: ['js', 'jsx', 'ts', 'tsx', 'json'],
};
