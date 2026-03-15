# Development Process

## Commands
- `npm test` or `./node_modules/.bin/jest` - Run tests
- `./node_modules/.bin/jest --coverage` - Run tests with coverage
- `./node_modules/.bin/tsc --noEmit` - TypeScript type check
- `npm run lint` - Run linter (use `-- --fix` for auto-fix)

## Workflow
1. Make changes
2. Run tests (`npm test`)
3. Run typecheck (`./node_modules/.bin/tsc --noEmit`)
4. Run lint (`npm run lint`)
5. Commit

## Refactoring Checklist
- Create new module files
- Add tests for new modules
- Run full test suite
- Delete old duplicate files
- Update coverage (target: 80%+)
