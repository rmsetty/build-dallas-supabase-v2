class MeetupError(Exception):
    def __init__(self, operation, message, status=502):
        super().__init__(message)
        self.operation = operation
        self.status = status


class MeetupGraphQLError(MeetupError):
    pass


class MeetupPersistedQueryError(MeetupGraphQLError):
    pass


class MeetupSchemaError(MeetupError):
    pass
