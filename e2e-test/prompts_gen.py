from typing import Annotated, Literal, Optional, Union, final
from pydantic import BaseModel, Field


@final
class schema:
  @final
  class meta:
    class Meta(BaseModel):
      temperature: float
      foobar: Optional['schema.meta.Meta_Foobar']
      zooBar: Optional['schema.meta.Meta_ZooBar']


    type Meta_Foobar = Literal[
      'foo',
      'bar',
    ]


    type Meta_ZooBar = Annotated[
      Union[
        'schema.meta.Meta_ZooBar_KindFoo',
        'schema.meta.Meta_ZooBar_KindBar',
      ],
      Field(discriminator="kind"),
    ]


    class Meta_ZooBar_KindFoo(BaseModel):
      kind: Literal['foo']
      foo: str


    class Meta_ZooBar_KindBar(BaseModel):
      kind: Literal['bar']
      bar: str


  @final
  class Main:
    @final
    class MyTemplate:
      class Input(BaseModel):
        firstName: str
        lastName: str
        fooToBar: Optional[dict[str, int]]


      class Output(BaseModel):
        x: int


    @final
    class myTool:
      class Input(BaseModel):
        foo: str
        x: Optional[int]
        y: Optional[int]


      class Output(BaseModel):
        bar: str

