// Lightweight runtime DTO validation usage examples
import { isUserDto, isAccountDto } from '../validators';
import type { UserDto } from '../dtos';
import type { AccountDto } from '../dtos';

export function runDtoValidationExamples() {
  const maybeUser: unknown = { id: 'u1', email: 'user@example.com', firstName: 'Alex', lastName: 'Doe' };
  console.log('isUserDto(maybeUser):', isUserDto(maybeUser)); // true if shape matches

  const maybeAcct: unknown = { id: 'acct1', name: 'Checking', type: 'checking', balance: 1000 };
  if (isAccountDto(maybeAcct)) {
    const acc = maybeAcct as AccountDto;
    console.log('Account name:', acc.name);
  } else {
    console.log('maybeAcct is not a valid AccountDto');
  }
}

// If this file is executed directly (e.g., via ts-node or a TS transpile step), run the example.
// This does not execute during normal TS compilation of the library.
// eslint-disable-next-line @typescript-eslint/no-implied-eval
if (typeof require !== 'undefined' && (require as any).main === module) {
  runDtoValidationExamples();
}
