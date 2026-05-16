# Development Process

## Commands
- `npm test` or `./node_modules/.bin/jest` - Run tests
- `./node_modules/.bin/jest --coverage` - Run tests with coverage
- `./node_modules/.bin/tsc --noEmit` - TypeScript type check
- `npm run lint` - Run linter (use `-- --fix` for auto-fix)

## Workflow
1. Create SPEC.md with target specification
2. Create PLAN.md with ordered task groups (reference SPEC.md)
3. Make changes
4. Run tests after each functionality (`npm test`)
5. Run typecheck (`./node_modules/.bin/tsc --noEmit`)
6. Run lint (`npm run lint`)
7. Commit

## Before fixing bugs or adding unplanned features

Update `TODO.md` and `SPEC.md` before writing any code:

- **TODO.md** — add an entry describing what needs to change and which files are affected.
- **SPEC.md** — if the fix or feature changes observable behaviour or an API surface, add or update the relevant spec section.

Commit the doc updates before or alongside the implementation. Do not implement first and document after.

## Test Coverage
- Target coverage: 60-70%
- Test after implementing each piece of functionality
- Mock as needed to achieve coverage

## Documentation Structure

### SPEC.md
- Contains the target specification we want in the end
- Should be detailed enough to implement from
- Written before coding, updated as understanding evolves

### PLAN.md
- Ordered list of groups of tasks
- Tasks in each group are possible to perform in parallel
- Reference SPEC.md sections by name
- Keep lean - just task names and references

## Refactoring Checklist
- Create new module files
- Add tests for new modules
- Run full test suite
- Delete old duplicate files
- Update coverage (target: 60-70%)
